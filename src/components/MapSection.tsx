'use client'

import { DivIcon } from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const COUNTRY_COORDS: Record<string, [number, number]> = {
  'Australia':[-25,134],'Angola':[-12.5,18.5],'Brazil':[-14,-51],'Brasil':[-14,-51],
  'Norway':[62,10],'Norge':[62,10],'UK':[55,-3],'USA':[37,-95],'Qatar':[25.3,51.2],
  'Saudi Arabia':[24,45],'UAE':[24,54],'Nigeria':[10,8],'Ghana':[7.9,-1.0],
  'Mozambique':[-18.7,35.5],'Egypt':[27,30],'India':[20.6,79],'Malaysia':[4.2,101.9],
  'Indonesia':[-0.8,113.9],'Mexico':[23,-102],'Trinidad':[10.4,-61.3],
  'Guyana':[4.9,-58.9],'Canada':[56,-106],'Italy':[42.5,12.5],'Turkey':[39,35],
  'Oman':[21,57],'Kuwait':[29.3,47.5],'Azerbaijan':[40.1,47.6],
  'Senegal':[14.5,-14.5],'Ivory Coast':[7.5,-5.5],'Suriname':[4,-56],
  'Argentina':[-38.4,-63.6],'China':[35,105],'Thailand':[15.9,100.9],
  'Vietnam':[14,108],'Philippines':[13,122],'Myanmar':[19.7,96.2],
  'United States':[37,-95],'United Kingdom':[55,-3],'Congo':[-4.3,15.3],
  'Gabon':[-0.8,11.6],'Ireland':[53.1,-7.7],'Namibia':[-22.6,17],
  'Romania':[45.9,24.9],'Russia':[61,105],
}

const COUNTRY_FLAGS: Record<string, string> = {
  'Australia':'au','Angola':'ao','Brazil':'br','Brasil':'br',
  'Norway':'no','Norge':'no','UK':'gb','USA':'us','Qatar':'qa',
  'Saudi Arabia':'sa','UAE':'ae','Nigeria':'ng','Ghana':'gh',
  'Mozambique':'mz','Egypt':'eg','India':'in','Malaysia':'my',
  'Indonesia':'id','Mexico':'mx','Trinidad':'tt',
  'Guyana':'gy','Canada':'ca','Italy':'it','Turkey':'tr',
  'Oman':'om','Kuwait':'kw','Azerbaijan':'az',
  'Senegal':'sn','Ivory Coast':'ci','Suriname':'sr',
  'Argentina':'ar','China':'cn','Thailand':'th',
  'Vietnam':'vn','Philippines':'ph','Myanmar':'mm',
  'United States':'us','United States of America':'us','United Kingdom':'gb','Great Britain':'gb','United Arab Emirates':'ae',
  'Congo':'cg','Gabon':'ga','Ireland':'ie','Namibia':'na',
  'Romania':'ro','Russia':'ru',
}

function normalizeCountryName(value: string): string {
  return value.trim().toLowerCase()
}

const COUNTRY_COORDS_BY_KEY = new Map<string, [number, number]>(
  Object.entries(COUNTRY_COORDS).map(([country, coords]) => [normalizeCountryName(country), coords]),
)

const COUNTRY_FLAGS_BY_KEY = new Map<string, string>(
  Object.entries(COUNTRY_FLAGS).map(([country, flagCode]) => [normalizeCountryName(country), flagCode]),
)

const FLAG_ICON_CACHE = new Map<string, DivIcon>()

function createFlagIcon(flagCode: string, flagHeight: number, isActive: boolean): DivIcon {
  const width = Math.round(flagHeight * 1.35)
  const activeStyle = isActive
    ? 'border-color:#c9a84c;box-shadow:0 0 0 2px rgba(201,168,76,0.5),0 4px 10px rgba(0,0,0,0.45);'
    : 'border-color:#4db89e;box-shadow:0 2px 8px rgba(0,0,0,0.35);'
  const cacheKey = `${flagCode}-${width}-${flagHeight}-${isActive ? 'active' : 'default'}`
  const cached = FLAG_ICON_CACHE.get(cacheKey)
  if (cached) return cached

  const icon = new DivIcon({
    className: 'country-flag-icon',
    iconSize: [width, flagHeight],
    iconAnchor: [Math.round(width / 2), Math.round(flagHeight / 2)],
    popupAnchor: [0, -Math.round(flagHeight / 2)],
    tooltipAnchor: [0, -Math.round(flagHeight / 2)],
    html: `<span style="display:block;width:${width}px;height:${flagHeight}px;border:2px solid;border-radius:4px;overflow:hidden;background:#10231d;${activeStyle}"><img src="https://flagcdn.com/w80/${flagCode}.png" alt="" style="display:block;width:100%;height:100%;object-fit:cover;" loading="lazy" /></span>`,
  })

  FLAG_ICON_CACHE.set(cacheKey, icon)
  return icon
}

interface Props {
  countryData: { country: string; count: number }[]
  onCountrySelect?: (country: string) => void
  activeCountry?: string | null
}

export default function MapSection({ countryData, onCountrySelect, activeCountry }: Props) {
  const maxCount = Math.max(...countryData.map((item) => item.count || 0), 1)
  const activeCountryKey = normalizeCountryName(activeCountry ?? '')

  return (
    <div className="relative w-full h-[400px] rounded-xl overflow-hidden z-0 border border-[var(--csub-light-soft)] shadow-lg">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        scrollWheelZoom={false}
        className="w-full h-full bg-[var(--bg-dark)]"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        {countryData.map((entry) => {
          const countryKey = normalizeCountryName(entry.country)
          const coords = COUNTRY_COORDS_BY_KEY.get(countryKey)
          const flagCode = COUNTRY_FLAGS_BY_KEY.get(countryKey)
          if (!coords || !flagCode) return null

          const isActive = activeCountryKey === countryKey
          const intensity = Math.sqrt((entry.count || 0) / maxCount)
          const flagHeight = Math.min(40, Math.max(18, Math.round(18 + intensity * 16 + (isActive ? 4 : 0))))

          return (
            <Marker
              key={entry.country}
              position={coords}
              icon={createFlagIcon(flagCode, flagHeight, isActive)}
              eventHandlers={{
                click: () => {
                  onCountrySelect?.(entry.country)
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -Math.round(flagHeight * 0.65)]}>
                {entry.country}
              </Tooltip>
              <Popup>
                <strong>{entry.country}</strong>
                <br />
                {entry.count} prosjekter
                {onCountrySelect && (
                  <>
                    <br />
                    Klikk for detaljer
                  </>
                )}
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
