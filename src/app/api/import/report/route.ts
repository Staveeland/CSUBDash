import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import OpenAI from 'openai'

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

interface ForecastEntry {
  year: number
  metric: string
  value: number
  unit: string
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const supabase = createAdminClient()
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')

    // Create import batch
    const { data: batch } = await supabase.from('import_batches').insert({
      file_name: file.name,
      file_type: 'pdf_market_report',
      status: 'processing',
    }).select().single()
    const batchId = batch!.id

    // Step 1: Generate AI summary + extract key figures
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-5.2',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                file_data: `data:application/pdf;base64,${base64}`,
                filename: file.name,
              },
            } as unknown as OpenAI.Chat.Completions.ChatCompletionContentPartText,
            {
              type: 'text',
              text: `This is a Subsea Market Report. Analyze the entire document and return a JSON object with:

1. "summary": A comprehensive executive summary (500-800 words) covering:
   - Market outlook and trends
   - Key regions and activity drivers
   - Major operators and contractors mentioned
   - Risks and challenges
   - Notable contract awards or project updates

2. "key_figures": An object with notable numbers extracted:
   - "total_subsea_capex_usd_bn": number or null
   - "xmt_forecast_units": number or null (annual XMT installations forecast)
   - "surf_km_forecast": number or null
   - "yoy_growth_pct": number or null (year-over-year growth)
   - Other notable metrics as key-value pairs

3. "forecasts": An array of forecast data points, each with:
   - "year": number (the forecast year)
   - "metric": string (e.g. "subsea_capex_usd_bn", "xmt_installations", "surf_km", "subsea_unit_count", "pipeline_km")
   - "value": number
   - "unit": string (e.g. "USD bn", "units", "km", "%")

Extract as many forecast data points as possible from tables, charts and text. Include historical data points if shown.

4. "report_period": string (e.g. "Q1 2024", "Q3 2024")

Return ONLY valid JSON, no other text.`,
            },
          ],
        },
      ],
      temperature: 0,
      max_completion_tokens: 16000,
    })

    const content = response.choices[0]?.message?.content || '{}'
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    const summary = parsed.summary || 'No summary generated'
    const keyFigures = parsed.key_figures || {}
    const forecasts: ForecastEntry[] = parsed.forecasts || []
    const reportPeriod = parsed.report_period || file.name

    // Step 2: Store document with AI summary (dedup by file_name)
    const externalDocId = `report-${file.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`

    // Check if document already exists
    const { data: existingDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('file_name', file.name)
      .limit(1)

    let documentId: string
    if (existingDoc && existingDoc.length > 0) {
      // Update existing
      documentId = existingDoc[0].id
      await supabase.from('documents').update({
        ai_summary: `## ${reportPeriod}\n\n${summary}\n\n### Key Figures\n${JSON.stringify(keyFigures, null, 2)}`,
      }).eq('id', documentId)
    } else {
      // Insert new — use a system user id for uploaded_by
      const { data: doc } = await supabase.from('documents').insert({
        uploaded_by: '00000000-0000-0000-0000-000000000000', // system user
        file_name: file.name,
        file_path: `reports/${externalDocId}`,
        file_type: 'application/pdf',
        file_size_bytes: buffer.length,
        ai_summary: `## ${reportPeriod}\n\n${summary}\n\n### Key Figures\n${JSON.stringify(keyFigures, null, 2)}`,
      }).select().single()
      documentId = doc!.id
    }

    // Step 3: Upsert forecasts
    let forecastsImported = 0
    if (forecasts.length > 0) {
      const forecastRows = forecasts.map(f => ({
        year: f.year,
        metric: f.metric,
        value: f.value,
        unit: f.unit,
        source: 'rystad_report',
      }))

      for (const row of forecastRows) {
        const { error } = await supabase.from('forecasts')
          .upsert(row, { onConflict: 'year,metric', ignoreDuplicates: false })
        if (!error) forecastsImported++
      }
    }

    // Update batch
    await supabase.from('import_batches').update({
      status: 'completed',
      records_total: forecasts.length + 1,
      records_imported: forecastsImported + 1,
      records_skipped: 0,
      completed_at: new Date().toISOString(),
    }).eq('id', batchId)

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      document_id: documentId,
      report_period: reportPeriod,
      summary_length: summary.length,
      forecasts_extracted: forecasts.length,
      forecasts_imported: forecastsImported,
      key_figures: keyFigures,
    })
  } catch (error) {
    console.error('Report import error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
