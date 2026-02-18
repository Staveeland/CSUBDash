export interface CompetitorCompany {
  name: string
  aliases: string[]
}

const COMPETITOR_COMPANIES_RAW: Array<{ name: string; aliases?: string[] }> = [
  { name: 'Aker Marine Contractors' },
  { name: 'Aker Solutions' },
  { name: 'Alam Maritime Resources' },
  { name: 'Allseas' },
  { name: 'Baker Hughes' },
  { name: 'Boskalis' },
  { name: 'Bourbon Offshore' },
  { name: 'Clough' },
  { name: 'COOEC', aliases: ['China Offshore Oil Engineering Co., Ltd.'] },
  { name: 'EMC' },
  { name: 'Five Ocean' },
  { name: 'FMC Kongsberg Subsea AS', aliases: ['FMC Kongsberg SubseaAS'] },
  { name: 'GSP Offshore' },
  { name: 'Halliburton' },
  { name: 'Havfram' },
  { name: 'Heerema Marine Contractors' },
  { name: 'Helix Energy Solutions' },
  { name: 'Hyundai Heavy Industries', aliases: ['HHI', 'Hyundai Heavy Industries (HHI)'] },
  { name: 'Iranian Offshore Engineering and Construction' },
  { name: 'Larsen & Toubro', aliases: ['Larsen and Toubro', 'L&T'] },
  { name: 'Mazagon Dock Shipbuilders' },
  { name: 'Ocean Installer' },
  { name: 'Oceaneering' },
  { name: 'OneSubsea' },
  { name: 'Petroleum Development Consultants' },
  { name: 'Punj Lloyd' },
  { name: 'Saipem' },
  { name: 'Sapura Energy' },
  { name: 'Sea Trucks Group' },
  { name: 'Subsea 7', aliases: ['Subsea7'] },
  { name: 'Swiber Holdings' },
  { name: 'TechnipFMC' },
  { name: 'Timas Suplindo' },
  { name: 'Trident' },
  { name: 'TSmarine' },
]

function normalizeCompanyKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export const COMPETITOR_COMPANIES: CompetitorCompany[] = COMPETITOR_COMPANIES_RAW.reduce<CompetitorCompany[]>(
  (companies, item) => {
    const key = normalizeCompanyKey(item.name)
    if (companies.some((company) => normalizeCompanyKey(company.name) === key)) {
      return companies
    }

    const aliases = new Set<string>([item.name])
    item.aliases?.forEach((alias) => {
      if (alias.trim()) aliases.add(alias.trim())
    })

    companies.push({
      name: item.name,
      aliases: Array.from(aliases),
    })
    return companies
  },
  []
)
