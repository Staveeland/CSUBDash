import { NextRequest, NextResponse } from 'next/server'

/**
 * Auto-detect PDF type and route to the correct parser.
 * - "OFS Contract" / "Contract Updates" → /api/import/pdf (contract extraction)
 * - "Subsea Market Report" / "Market Report" → /api/import/report (AI summary + forecasts)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const name = file.name.toLowerCase()

    let endpoint: string
    if (name.includes('market report') || name.includes('subsea market')) {
      endpoint = '/api/import/report'
    } else if (name.includes('contract') || name.includes('ofs')) {
      endpoint = '/api/import/pdf'
    } else {
      // Default: try contract parser
      endpoint = '/api/import/pdf'
    }

    // Forward the file to the detected endpoint
    const newFormData = new FormData()
    newFormData.append('file', file)

    const baseUrl = request.nextUrl.origin
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      body: newFormData,
    })

    const data = await res.json()
    return NextResponse.json({ ...data, detected_type: endpoint })
  } catch (error) {
    console.error('Auto-detect error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
