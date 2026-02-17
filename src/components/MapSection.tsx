'use client'

import { Canvas } from '@react-three/fiber'
import { Html, OrbitControls, Stars, useTexture } from '@react-three/drei'
import { useMemo } from 'react'
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
  quaternion: [number, number, number, number]
  flagCode: string
  isActive: boolean
  markerWidthWorld: number
  markerHeightWorld: number
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

function getSurfaceQuaternion(position: [number, number, number]): [number, number, number, number] {
  const normal = new THREE.Vector3(position[0], position[1], position[2]).normalize()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w]
}

function EarthGlobe() {
  const earthTexture = useTexture('/textures/earth_atmos_2048.jpg')
  const correctedTexture = useMemo(() => {
    const clonedTexture = earthTexture.clone()
    clonedTexture.colorSpace = THREE.SRGBColorSpace
    clonedTexture.needsUpdate = true
    return clonedTexture
  }, [earthTexture])

  return (
    <group>
      <mesh>
        <sphereGeometry args={[2.05, 96, 96]} />
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
        <sphereGeometry args={[2.12, 72, 72]} />
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

function FlagMarkers({
  points,
  onCountrySelect,
}: {
  points: GlobePoint[]
  onCountrySelect?: (country: string) => void
}) {
  const flagCodes = useMemo(() => Array.from(new Set(points.map((point) => point.flagCode))), [points])
  const flagTextureUrls = useMemo(() => flagCodes.map((code) => `https://flagcdn.com/w160/${code}.png`), [flagCodes])
  const loadedTextures = useTexture(flagTextureUrls)

  const textureByCode = useMemo(() => {
    const map = new Map<string, THREE.Texture>()
    flagCodes.forEach((code, index) => {
      const texture = loadedTextures[index]
      if (!texture) return
      const clonedTexture = texture.clone()
      clonedTexture.colorSpace = THREE.SRGBColorSpace
      clonedTexture.needsUpdate = true
      map.set(code, clonedTexture)
    })
    return map
  }, [flagCodes, loadedTextures])

  return (
    <>
      {points.map((point) => {
        const flagTexture = textureByCode.get(point.flagCode)
        if (!flagTexture) return null

        return (
          <group key={point.country} position={point.position} quaternion={point.quaternion}>
            {point.isActive && (
              <mesh position={[0, 0, -0.003]}>
                <planeGeometry args={[point.markerWidthWorld + 0.03, point.markerHeightWorld + 0.03]} />
                <meshBasicMaterial color="#c9a84c" transparent opacity={0.75} toneMapped={false} />
              </mesh>
            )}

            <mesh
              position={[0, 0, 0.005]}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onCountrySelect?.(point.country)
              }}
            >
              <planeGeometry args={[point.markerWidthWorld, point.markerHeightWorld]} />
              <meshBasicMaterial map={flagTexture} transparent toneMapped={false} />
            </mesh>

            {point.isActive && (
              <Html position={[0, point.markerHeightWorld * 0.9, 0.05]} transform sprite occlude={true} distanceFactor={16} zIndexRange={[80, 0]}>
                <div
                  style={{
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(201,168,76,0.5)',
                    backgroundColor: 'rgba(9,20,18,0.82)',
                    color: '#d7ece7',
                    fontSize: '10px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  }}
                >
                  <strong>{point.country}</strong> • {point.count} prosjekter
                </div>
              </Html>
            )}
          </group>
        )
      })}
    </>
  )
}

export default function MapSection({ countryData, onCountrySelect, activeCountry }: Props) {
  const activeCountryKey = normalizeCountryName(activeCountry ?? '')
  const maxCount = Math.max(...countryData.map((item) => item.count || 0), 1)

  const points = useMemo<GlobePoint[]>(() => {
    return countryData.flatMap((entry) => {
      const key = normalizeCountryName(entry.country)
      const coords = COUNTRY_COORDS_BY_KEY.get(key)
      const flagCode = COUNTRY_FLAGS_BY_KEY.get(key)
      if (!coords || !flagCode) return []

      const [lat, lon] = coords
      const position = latLonToVector3(lat, lon, 2.09)
      const quaternion = getSurfaceQuaternion(position)
      const intensity = Math.sqrt((entry.count || 0) / maxCount)
      const markerWidthWorld = 0.16 + intensity * 0.07 + (activeCountryKey === key ? 0.015 : 0)
      const markerHeightWorld = markerWidthWorld * 0.66

      return [{
        country: entry.country,
        count: entry.count,
        position,
        quaternion,
        flagCode,
        isActive: activeCountryKey === key,
        markerWidthWorld,
        markerHeightWorld,
      }]
    })
  }, [activeCountryKey, countryData, maxCount])

  return (
    <div className="relative w-full h-[400px] rounded-xl overflow-hidden border border-[var(--csub-light-soft)] shadow-lg bg-[#071610]">
      <Canvas camera={{ position: [0, 0, 8.3], fov: 40 }} dpr={[1, 2]}>
        <color attach="background" args={['#0a211b']} />
        <ambientLight intensity={1.05} />
        <hemisphereLight args={['#b7e9dd', '#0b1d18', 0.8]} />
        <directionalLight position={[7, 5, 4]} intensity={1.4} color="#b9ece0" />
        <directionalLight position={[-6, -4, -5]} intensity={0.55} color="#4db89e" />

        <Stars radius={70} depth={30} count={1100} factor={2} saturation={0} fade speed={0.25} />
        <EarthGlobe />
        <FlagMarkers points={points} onCountrySelect={onCountrySelect} />

        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={4.8}
          maxDistance={10}
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
