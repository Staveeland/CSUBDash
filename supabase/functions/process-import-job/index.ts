import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

serve(async (request) => {
  try {
    const { job_id } = await request.json()
    if (!job_id) {
      return new Response(JSON.stringify({ error: 'Missing job_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const appBaseUrl = Deno.env.get('APP_BASE_URL')
    if (!appBaseUrl) {
      return new Response(JSON.stringify({ error: 'APP_BASE_URL not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const workerSecret = Deno.env.get('IMPORT_WORKER_SECRET')
    if (workerSecret) {
      headers['x-import-secret'] = workerSecret
    }

    const response = await fetch(`${appBaseUrl}/api/import/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ job_id }),
    })

    const body = await response.text()
    return new Response(body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
