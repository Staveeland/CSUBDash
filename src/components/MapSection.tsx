'use client'

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
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

interface Props {
  countryData: { country: string; count: number }[]
  onCountrySelect?: (country: string) => void
  activeCountry?: string | null
}

export default function MapSection({ countryData, onCountrySelect, activeCountry }: Props) {
  const maxCount = Math.max(...countryData.map((item) => item.count || 0), 1)

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
          const coords = COUNTRY_COORDS[entry.country]
          if (!coords) return null
          const isActive = (activeCountry ?? '').trim().toLowerCase() === entry.country.trim().toLowerCase()
          const radius = Math.max(6, Math.sqrt(entry.count / maxCount) * 30) + (isActive ? 2 : 0)
          return (
            <CircleMarker
              key={entry.country}
              center={coords}
              radius={radius}
              eventHandlers={{
                click: () => {
                  onCountrySelect?.(entry.country)
                },
              }}
              pathOptions={{
                fillColor: isActive ? '#c9a84c' : '#4db89e',
                color: isActive ? '#3d3212' : '#0e2620',
                weight: 1.5,
                opacity: 0.9,
                fillOpacity: isActive ? 0.85 : 0.6,
              }}
            >
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
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
