'use client'

import { Canvas } from '@react-three/fiber'
import { Html, OrbitControls, Stars, useTexture } from '@react-three/drei'
import { useCallback, useMemo, useState } from 'react'
import * as THREE from 'three'

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

interface Props {
  countryData: { country: string; count: number }[]
  onCountrySelect?: (country: string) => void
  activeCountry?: string | null
}

interface GlobePoint {
  country: string
  count: number
  position: [number, number, number]
  flagCode: string
  isActive: boolean
  markerWidth: number
  markerHeight: number
}

function normalizeCountryName(value: string): string {
  return value.trim().toLowerCase()
}

const COUNTRY_COORDS_BY_KEY = new Map<string, [number, number]>(
  Object.entries(COUNTRY_COORDS).map(([country, coords]) => [normalizeCountryName(country), coords]),
)

const COUNTRY_FLAGS_BY_KEY = new Map<string, string>(
  Object.entries(COUNTRY_FLAGS).map(([country, code]) => [normalizeCountryName(country), code]),
)

function latLonToVector3(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)

  const x = -(radius * Math.sin(phi) * Math.cos(theta))
  const y = radius * Math.cos(phi)
  const z = radius * Math.sin(phi) * Math.sin(theta)

  return [x, y, z]
}

function EarthGlobe({ onSurfaceChange }: { onSurfaceChange: (mesh: THREE.Mesh | null) => void }) {
  const earthTexture = useTexture('/textures/earth_atmos_2048.jpg')
  const correctedTexture = useMemo(() => {
    const clonedTexture = earthTexture.clone()
    clonedTexture.colorSpace = THREE.SRGBColorSpace
    clonedTexture.needsUpdate = true
    return clonedTexture
  }, [earthTexture])

  return (
    <group>
      <mesh ref={onSurfaceChange}>
        <sphereGeometry args={[2.45, 96, 96]} />
        <meshStandardMaterial
          map={correctedTexture}
          color="#d9e8e2"
          roughness={0.92}
          metalness={0.02}
          emissive="#123229"
          emissiveIntensity={0.2}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[2.52, 72, 72]} />
        <meshPhongMaterial
          color="#63bfa8"
          transparent
          opacity={0.09}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export default function MapSection({ countryData, onCountrySelect, activeCountry }: Props) {
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null)
  const [globeSurface, setGlobeSurface] = useState<THREE.Mesh | null>(null)
  const activeCountryKey = normalizeCountryName(activeCountry ?? '')
  const maxCount = Math.max(...countryData.map((item) => item.count || 0), 1)
  const occluders = useMemo(() => (globeSurface ? [globeSurface] : false), [globeSurface])
  const handleSurfaceChange = useCallback((mesh: THREE.Mesh | null) => {
    setGlobeSurface((current) => (current === mesh ? current : mesh))
  }, [])

  const points = useMemo<GlobePoint[]>(() => {
    return countryData.flatMap((entry) => {
      const key = normalizeCountryName(entry.country)
      const coords = COUNTRY_COORDS_BY_KEY.get(key)
      const flagCode = COUNTRY_FLAGS_BY_KEY.get(key)
      if (!coords || !flagCode) return []

      const [lat, lon] = coords
      const position = latLonToVector3(lat, lon, 2.58)
      const intensity = Math.sqrt((entry.count || 0) / maxCount)
      const markerWidth = Math.round(12 + intensity * 7 + (activeCountryKey === key ? 2 : 0))
      const markerHeight = Math.round(markerWidth * 0.66)

      return [{
        country: entry.country,
        count: entry.count,
        position,
        flagCode,
        isActive: activeCountryKey === key,
        markerWidth,
        markerHeight,
      }]
    })
  }, [activeCountryKey, countryData, maxCount])

  return (
    <div className="relative w-full h-[400px] rounded-xl overflow-hidden border border-[var(--csub-light-soft)] shadow-lg bg-[#071610]">
      <Canvas camera={{ position: [0, 0, 7], fov: 40 }} dpr={[1, 2]}>
        <color attach="background" args={['#0a211b']} />
        <ambientLight intensity={1.05} />
        <hemisphereLight args={['#b7e9dd', '#0b1d18', 0.8]} />
        <directionalLight position={[7, 5, 4]} intensity={1.4} color="#b9ece0" />
        <directionalLight position={[-6, -4, -5]} intensity={0.55} color="#4db89e" />

        <Stars radius={70} depth={30} count={1100} factor={2} saturation={0} fade speed={0.25} />
        <EarthGlobe onSurfaceChange={handleSurfaceChange} />

        {points.map((point) => {
          const isHovered = hoveredCountry === point.country
          const borderColor = point.isActive ? '#c9a84c' : '#4db89e'

          return (
            <group key={point.country} position={point.position}>
              <Html transform sprite occlude={occluders} distanceFactor={11} zIndexRange={[60, 0]}>
                <button
                  type="button"
                  onPointerEnter={(event) => {
                    event.stopPropagation()
                    setHoveredCountry(point.country)
                  }}
                  onPointerLeave={(event) => {
                    event.stopPropagation()
                    setHoveredCountry((current) => current === point.country ? null : current)
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onCountrySelect?.(point.country)
                  }}
                  style={{
                    width: `${point.markerWidth}px`,
                    height: `${point.markerHeight}px`,
                    border: `1.5px solid ${borderColor}`,
                    borderRadius: '3px',
                    backgroundColor: '#10231d',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    boxShadow: point.isActive
                      ? '0 0 0 1px rgba(201,168,76,0.35), 0 3px 9px rgba(0,0,0,0.4)'
                      : '0 2px 7px rgba(0,0,0,0.35)',
                  }}
                  aria-label={`${point.country} (${point.count} prosjekter)`}
                  title={`${point.country}: ${point.count} prosjekter`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://flagcdn.com/w40/${point.flagCode}.png`}
                    alt=""
                    draggable={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </button>
              </Html>

              {(isHovered || point.isActive) && (
                <Html position={[0, 0.24, 0]} transform sprite occlude={occluders} distanceFactor={16} zIndexRange={[80, 0]}>
                  <div
                    style={{
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: point.isActive ? '1px solid rgba(201,168,76,0.6)' : '1px solid rgba(77,184,158,0.45)',
                      backgroundColor: 'rgba(9,20,18,0.88)',
                      color: '#d7ece7',
                      fontSize: '12px',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.45)',
                    }}
                  >
                    <strong>{point.country}</strong> • {point.count} prosjekter
                  </div>
                </Html>
              )}
            </group>
          )
        })}

        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={4.2}
          maxDistance={9}
          rotateSpeed={0.65}
          zoomSpeed={0.65}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-[var(--csub-light-soft)] bg-[rgba(8,20,17,0.8)] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
        Hold mouse to rotate globe
      </div>
    </div>
  )
}
