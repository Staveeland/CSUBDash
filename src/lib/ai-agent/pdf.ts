import 'server-only'

// ─── HTML → PDF via Puppeteer (Chromium) ──────────────────────────────────────

type BuildReportPdfInput = {
  title: string
  subtitle: string
  requestText: string
  markdown: string
  generatedAt: string
}

/** Convert markdown to clean HTML */
function markdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks → remove entirely (technical noise)
  html = html.replace(/```[\s\S]*?```/g, '')

  // Tables
  html = html.replace(
    /(?:^\|.+\|$\n?)+/gm,
    (tableBlock) => {
      const lines = tableBlock.trim().split('\n').filter(l => l.trim())
      if (lines.length < 2) return tableBlock

      const parseRow = (line: string) =>
        line.split('|').map(c => c.trim()).filter(Boolean)

      const headers = parseRow(lines[0])
      // Skip separator line (line[1])
      const isSep = (l: string) => /^[\s|:-]+$/.test(l)
      const dataStart = isSep(lines[1]) ? 2 : 1
      const rows = lines.slice(dataStart).map(parseRow)

      let t = '<table><thead><tr>'
      headers.forEach(h => { t += `<th>${cleanInline(h)}</th>` })
      t += '</tr></thead><tbody>'
      rows.forEach(r => {
        t += '<tr>'
        r.forEach(c => { t += `<td>${cleanInline(c)}</td>` })
        t += '</tr>'
      })
      t += '</tbody></table>'
      return t
    }
  )

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Numbered headings like "1) Title" or "3. Title"
  html = html.replace(/^(\d+)[.)]\s+([A-ZÆØÅ].+)$/gm, '<h2>$1. $2</h2>')

  // Horizontal rules
  html = html.replace(/^-{3,}$/gm, '<hr>')
  html = html.replace(/^\*{3,}$/gm, '<hr>')

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/_(.+?)_/g, '<em>$1</em>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Links
  html = html.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

  // Bullet lists
  html = html.replace(
    /(?:^[-*•]\s+.+$\n?)+/gm,
    (block) => {
      const items = block.trim().split('\n')
        .map(l => l.replace(/^[-*•]\s+/, '').trim())
        .filter(Boolean)
      return '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>'
    }
  )

  // Numbered lists
  html = html.replace(
    /(?:^\d+\.\s+.+$\n?)+/gm,
    (block) => {
      const items = block.trim().split('\n')
        .map(l => l.replace(/^\d+\.\s+/, '').trim())
        .filter(Boolean)
      return '<ol>' + items.map(i => `<li>${i}</li>`).join('') + '</ol>'
    }
  )

  // Paragraphs (remaining lines)
  html = html
    .split('\n\n')
    .map(block => {
      const b = block.trim()
      if (!b) return ''
      if (b.startsWith('<')) return b
      return `<p>${b.replace(/\n/g, '<br>')}</p>`
    })
    .join('\n')

  return html
}

function cleanInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function buildFullHtml(input: BuildReportPdfInput): string {
  const bodyHtml = markdownToHtml(input.markdown)

  return `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: A4;
    margin: 0;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    background: #0B1A16;
    color: #D5E8E2;
    font-size: 11px;
    line-height: 1.6;
    padding: 40px 48px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Header ── */
  .report-header {
    background: #0E2620;
    border-radius: 8px;
    padding: 24px 28px 20px;
    margin-bottom: 16px;
    border-top: 3px solid #4DB89E;
  }
  .report-label {
    color: #4DB89E;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .report-title {
    color: #F0F7F4;
    font-size: 22px;
    font-weight: 700;
    line-height: 1.3;
    margin-bottom: 8px;
  }
  .report-meta {
    color: #7FA89E;
    font-size: 9px;
  }

  /* ── Request box ── */
  .request-box {
    background: #0D231D;
    border-left: 3px solid #C9A84C;
    border-radius: 4px;
    padding: 12px 16px;
    margin-bottom: 28px;
  }
  .request-label {
    color: #C9A84C;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .request-text {
    color: #D5E8E2;
    font-size: 10px;
  }

  /* ── Content ── */
  h1 {
    color: #C9A84C;
    font-size: 18px;
    font-weight: 700;
    margin-top: 28px;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 2px solid #C9A84C33;
  }
  h2 {
    color: #4DB89E;
    font-size: 14px;
    font-weight: 700;
    margin-top: 22px;
    margin-bottom: 10px;
  }
  h3 {
    color: #F0F7F4;
    font-size: 12px;
    font-weight: 700;
    margin-top: 16px;
    margin-bottom: 6px;
  }

  p {
    margin-bottom: 8px;
    color: #D5E8E2;
    font-size: 10.5px;
    line-height: 1.7;
  }

  strong { color: #F0F7F4; }
  em { color: #7FA89E; font-style: italic; }
  code {
    background: #1A3D34;
    padding: 1px 5px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 9.5px;
    color: #4DB89E;
  }

  hr {
    border: none;
    border-top: 1px solid #1E3F36;
    margin: 18px 0;
  }

  /* ── Lists ── */
  ul, ol {
    margin: 8px 0 12px 0;
    padding-left: 4px;
  }
  li {
    margin-bottom: 4px;
    font-size: 10.5px;
    line-height: 1.6;
    padding-left: 14px;
    position: relative;
    list-style: none;
  }
  ul li::before {
    content: '›';
    color: #4DB89E;
    font-weight: 700;
    position: absolute;
    left: 0;
  }
  ol { counter-reset: item; }
  ol li { counter-increment: item; }
  ol li::before {
    content: counter(item) '.';
    color: #C9A84C;
    font-weight: 700;
    position: absolute;
    left: 0;
    font-size: 10px;
  }

  /* ── Tables ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0 16px;
    font-size: 9.5px;
  }
  thead tr {
    background: #1A3D34;
  }
  th {
    color: #C9A84C;
    font-weight: 700;
    text-align: left;
    padding: 8px 10px;
    font-size: 8.5px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    border-bottom: 2px solid #4DB89E44;
  }
  td {
    padding: 7px 10px;
    color: #D5E8E2;
    border-bottom: 1px solid #1E3F3666;
  }
  tbody tr:nth-child(even) {
    background: #0F2822;
  }
  tbody tr:nth-child(odd) {
    background: #112E26;
  }
  tbody tr:hover {
    background: #163D33;
  }

  /* ── Footer ── */
  .report-footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #1E3F36;
    color: #5A8A7E;
    font-size: 8px;
    text-align: center;
  }
</style>
</head>
<body>

<div class="report-header">
  <div class="report-label">CSUB AI Report</div>
  <div class="report-title">${escHtml(input.title)}</div>
  <div class="report-meta">${escHtml(input.subtitle)} · ${escHtml(input.generatedAt)}</div>
</div>

<div class="request-box">
  <div class="request-label">Forespørsel</div>
  <div class="request-text">${escHtml(input.requestText)}</div>
</div>

<div class="report-content">
  ${bodyHtml}
</div>

<div class="report-footer">
  CSUB Sales Intelligence · AI-Generated Report · ${escHtml(input.generatedAt)}
</div>

</body>
</html>`
}

function escHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

export async function buildReportPdfBuffer(input: BuildReportPdfInput): Promise<Buffer> {
  const html = buildFullHtml(input)

  // Try Puppeteer (works locally + Vercel with chromium-min)
  try {
    const puppeteer = await import('puppeteer-core')
    let executablePath: string | undefined

    // Try @sparticuz/chromium-min for serverless
    try {
      const chromium = await import('@sparticuz/chromium-min')
      const chr = chromium.default ?? chromium
      executablePath = await chr.executablePath(
        'https://github.com/nicholasgasior/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar'
      )
    } catch {
      // Local: find Chrome/Chromium
      const paths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
      ]
      const { existsSync } = await import('fs')
      executablePath = paths.find(p => existsSync(p))
    }

    if (!executablePath) {
      throw new Error('No Chrome/Chromium found')
    }

    const browser = await puppeteer.default.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    })

    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })

    await browser.close()

    return Buffer.from(pdfBuffer)
  } catch (err) {
    console.error('Puppeteer PDF failed, falling back to PDFKit:', err)
    return buildPdfKitFallback(input)
  }
}

// ─── PDFKit Fallback ──────────────────────────────────────────────────────────

async function buildPdfKitFallback(input: BuildReportPdfInput): Promise<Buffer> {
  type PDFDocumentCtor = new (options?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument

  let PDFDocument: PDFDocumentCtor
  try {
    const standalone = await import('pdfkit/js/pdfkit.standalone.js')
    PDFDocument = (standalone.default ?? standalone) as unknown as PDFDocumentCtor
  } catch {
    const nodeBuild = await import('pdfkit')
    PDFDocument = (nodeBuild.default ?? nodeBuild) as PDFDocumentCtor
  }

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, right: 50, bottom: 50, left: 50 },
    info: { Title: input.title, Author: 'CSUB AI Agent' },
  })

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    doc.fontSize(20).font('Helvetica-Bold').text(input.title, { align: 'left' })
    doc.moveDown(0.5)
    doc.fontSize(10).font('Helvetica').fillColor('#666')
      .text(`${input.subtitle} · ${input.generatedAt}`)
    doc.moveDown(1)

    // Simple markdown render
    const lines = input.markdown.split('\n')
    for (const line of lines) {
      const t = line.trim()
      if (!t) { doc.moveDown(0.3); continue }
      if (t.startsWith('# ')) {
        doc.moveDown(0.5).fontSize(16).font('Helvetica-Bold').fillColor('#333').text(t.slice(2))
        continue
      }
      if (t.startsWith('## ')) {
        doc.moveDown(0.4).fontSize(13).font('Helvetica-Bold').fillColor('#555').text(t.slice(3))
        continue
      }
      doc.fontSize(10).font('Helvetica').fillColor('#333')
        .text(t.replace(/\*\*/g, '').replace(/\*/g, ''), { lineGap: 2 })
    }

    doc.end()
  })
}
