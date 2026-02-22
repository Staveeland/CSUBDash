#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_FILE = 'Contract Awards 2024-2026 feb.xlsx'
const DEFAULT_SOURCE_TAG = 'excel:Contract Awards 2024-2026 feb.xlsx'
const CHUNK_SIZE = 250

const PACKAGE_COLUMNS = ['XMTs', 'Flowlines', 'Umbilicals', 'Risers', 'Jumpers']
const REQUIRED_COLUMNS = [
  'Award date (dd/mm/yyyy)',
  'Sub-project',
  'Contract ID',
  'Continent',
  'Country',
  'Operator',
  'Facility category',
  'Water depth category',
  'Budget',
]

function parseArgs(argv) {
  const args = {
    file: DEFAULT_FILE,
    replace: true,
    dryRun: false,
    sourceTag: DEFAULT_SOURCE_TAG,
  }

  for (let i = 2; i < argv.length; i++) {
    const part = argv[i]
    if (part === '--file' && argv[i + 1]) {
      args.file = argv[i + 1]
      i++
      continue
    }
    if (part === '--source-tag' && argv[i + 1]) {
      args.sourceTag = argv[i + 1]
      i++
      continue
    }
    if (part === '--no-replace') {
      args.replace = false
      continue
    }
    if (part === '--replace') {
      args.replace = true
      continue
    }
    if (part === '--dry-run') {
      args.dryRun = true
      continue
    }
    if (part === '--help' || part === '-h') {
      printUsage()
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${part}`)
  }

  return args
}

function printUsage() {
  console.log(`Usage:
  node scripts/import-contract-awards-2024-2026.mjs [options]

Options:
  --file <path>          Excel file path (default: "${DEFAULT_FILE}")
  --source-tag <value>   source_url value for imported rows
  --replace              Delete existing rows with same source_url before import (default)
  --no-replace           Keep existing rows and only upsert by external_id
  --dry-run              Parse and validate without writing to database
  --help, -h             Show this help

Required env:
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL or SUPABASE_PROJECT_REF`)
}

function str(value) {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : null
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function parseExcelDate(value) {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    const decoded = XLSX.SSF.parse_date_code(value)
    if (!decoded || !decoded.y || !decoded.m || !decoded.d) return null
    const iso = new Date(Date.UTC(decoded.y, decoded.m - 1, decoded.d)).toISOString().slice(0, 10)
    return iso
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
      .toISOString()
      .slice(0, 10)
  }

  const text = str(value)
  if (!text) return null

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const day = Number(slash[1])
    const month = Number(slash[2])
    const year = Number(slash[3])
    if (year >= 1900 && year <= 2200 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
    }
  }

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
      .toISOString()
      .slice(0, 10)
  }

  return null
}

function deriveContractType(packages) {
  const hasXmts = packages.includes('XMTs')
  const hasSurf = packages.some((pkg) => pkg !== 'XMTs')
  if (hasXmts && hasSurf) return 'Subsea'
  if (hasXmts) return 'SPS'
  if (hasSurf) return 'SURF'
  return 'Other'
}

function buildDescription({
  contractId,
  packages,
  packageOwners,
  facilityCategory,
  waterDepthCategory,
  budget,
  comment,
}) {
  const parts = []
  if (contractId) parts.push(`Contract ID: ${contractId}`)
  if (packages.length > 0) parts.push(`Packages: ${packages.join(', ')}`)
  if (packageOwners.length > 0) parts.push(`Package owners: ${packageOwners.join('; ')}`)
  if (facilityCategory) parts.push(`Facility category: ${facilityCategory}`)
  if (waterDepthCategory) parts.push(`Water depth category: ${waterDepthCategory}`)
  if (budget) parts.push(`Budget: ${budget}`)
  if (comment) parts.push(`Comment: ${comment}`)
  return parts.join(' | ')
}

function buildExternalId({
  fileTag,
  rowIndex,
  contractId,
  awardDate,
  subProject,
}) {
  const core = [contractId || 'no-contract-id', awardDate, subProject, `row-${rowIndex + 1}`].join('-')
  return [
    'xlsx',
    slug(fileTag),
    slug(core),
  ].join(':')
}

function yearFromIsoDate(isoDate) {
  if (!isoDate || isoDate.length < 4) return null
  const year = Number(isoDate.slice(0, 4))
  if (!Number.isFinite(year)) return null
  return year
}

async function upsertInChunks(supabase, rows) {
  let written = 0
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase
      .from('contracts')
      .upsert(chunk, { onConflict: 'external_id', ignoreDuplicates: false })

    if (error) {
      throw new Error(`Upsert failed for chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}`)
    }
    written += chunk.length
  }
  return written
}

async function main() {
  const args = parseArgs(process.argv)
  const absoluteFile = path.resolve(process.cwd(), args.file)

  if (!fs.existsSync(absoluteFile)) {
    throw new Error(`Excel file not found: ${absoluteFile}`)
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (process.env.SUPABASE_PROJECT_REF ? `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co` : null)

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL or SUPABASE_PROJECT_REF)')
  }

  const workbook = XLSX.readFile(absoluteFile, { cellDates: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('Workbook has no sheets')
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: true })
  if (!rows.length) {
    throw new Error(`Sheet "${sheetName}" is empty`)
  }

  const columnSet = new Set(Object.keys(rows[0]))
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !columnSet.has(column))
  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}`)
  }

  const normalizedRows = []
  const issues = []
  let validInputRows = 0
  let skippedInputRows = 0

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    const awardDate = parseExcelDate(row['Award date (dd/mm/yyyy)'])
    const subProject = str(row['Sub-project'])
    const contractId = str(row['Contract ID'])
    const continent = str(row['Continent'])
    const country = str(row['Country'])
    const operator = str(row['Operator']) || 'Unknown'
    const facilityCategory = str(row['Facility category'])
    const waterDepthCategory = str(row['Water depth category'])
    const budget = str(row['Budget'])
    const comment = str(row['Comment'])

    if (!subProject) {
      issues.push(`Row ${index + 2}: missing Sub-project`)
      skippedInputRows++
      continue
    }

    if (!awardDate) {
      issues.push(`Row ${index + 2}: invalid Award date`)
      skippedInputRows++
      continue
    }

    const packageOwners = []
    const supplierSet = new Set()
    const packageSet = new Set()
    for (const packageColumn of PACKAGE_COLUMNS) {
      const supplier = str(row[packageColumn])
      if (!supplier) continue
      packageOwners.push(`${packageColumn}=${supplier}`)
      supplierSet.add(supplier)
      packageSet.add(packageColumn)
    }

    if (supplierSet.size === 0) {
      issues.push(`Row ${index + 2}: no supplier values in package columns`)
      skippedInputRows++
      continue
    }

    validInputRows++
    const suppliers = Array.from(supplierSet)
    const packages = Array.from(packageSet)
    const externalId = buildExternalId({
      fileTag: args.sourceTag,
      rowIndex: index,
      contractId,
      awardDate,
      subProject,
    })

    normalizedRows.push({
      external_id: externalId,
      date: awardDate,
      announced_at: awardDate,
      supplier: suppliers.join(' / '),
      operator,
      project_name: subProject,
      description: buildDescription({
        contractId,
        packages,
        packageOwners,
        facilityCategory,
        waterDepthCategory,
        budget,
        comment,
      }),
      contract_type: deriveContractType(packages),
      region: continent,
      country,
      source: 'rystad_awards',
      source_url: args.sourceTag,
      pipeline_phase: 'awarded',
    })
  }

  const yearMap = new Map()
  for (const row of normalizedRows) {
    const year = yearFromIsoDate(row.date)
    if (!year) continue
    yearMap.set(year, (yearMap.get(year) || 0) + 1)
  }

  console.log(`Sheet: ${sheetName}`)
  console.log(`Input rows: ${rows.length}`)
  console.log(`Valid input rows: ${validInputRows}`)
  console.log(`Prepared contract rows: ${normalizedRows.length}`)
  console.log(`Skipped input rows: ${skippedInputRows}`)
  console.log(`Year split: ${JSON.stringify(Object.fromEntries([...yearMap.entries()].sort((a, b) => a[0] - b[0])))}`)

  if (issues.length > 0) {
    console.log(`Validation notes: ${issues.length}`)
    issues.slice(0, 10).forEach((issue) => console.log(`  - ${issue}`))
    if (issues.length > 10) {
      console.log(`  ... ${issues.length - 10} more`)
    }
  }

  if (normalizedRows.length === 0) {
    throw new Error('No rows left to import after validation')
  }

  if (args.dryRun) {
    console.log('Dry run enabled; no database writes performed.')
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (args.replace) {
    const before = await supabase
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('source_url', args.sourceTag)

    if (before.error) {
      throw new Error(`Failed counting existing source rows: ${before.error.message}`)
    }

    const existingCount = before.count || 0
    if (existingCount > 0) {
      const del = await supabase
        .from('contracts')
        .delete()
        .eq('source_url', args.sourceTag)

      if (del.error) {
        throw new Error(`Failed deleting existing source rows: ${del.error.message}`)
      }
    }

    console.log(`Replaced existing source rows: ${existingCount}`)
  }

  const written = await upsertInChunks(supabase, normalizedRows)
  console.log(`Rows written via upsert: ${written}`)

  const verify = await supabase
    .from('contracts')
    .select('external_id,date,project_name,supplier,operator,country,region,contract_type,source,source_url,description', { count: 'exact' })
    .eq('source_url', args.sourceTag)
    .order('date', { ascending: false })

  if (verify.error) {
    throw new Error(`Verification query failed: ${verify.error.message}`)
  }

  console.log(`Rows present after import: ${verify.count || 0}`)
  console.log('Sample rows:')
  ;(verify.data || []).slice(0, 5).forEach((row) => {
    console.log(`  - ${row.date} | ${row.project_name} | ${row.supplier} | ${row.contract_type}`)
  })
}

main().catch((error) => {
  console.error(`Import failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
