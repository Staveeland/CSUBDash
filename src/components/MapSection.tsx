'use client'

import { Canvas } from '@react-three/fiber'
import { Billboard, Line, OrbitControls, Stars, useTexture } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
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

interface Props {
  countryData: { country: string; count: number }[]
  onCountrySelect?: (country: string) => void
  activeCountry?: string | null
}

interface GlobePoint {
  country: string
  count: number
  sharePct: number
  rank: number
  anchorPosition: [number, number, number]
  markerPosition: [number, number, number]
  isActive: boolean
  nodeRadiusWorld: number
  glowRadiusWorld: number
}

function normalizeCountryName(value: string): string {
  return value.trim().toLowerCase()
}

const COUNTRY_COORDS_BY_KEY = new Map<string, [number, number]>(
  Object.entries(COUNTRY_COORDS).map(([country, coords]) => [normalizeCountryName(country), coords]),
)

function latLonToVector3(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)

  const x = -(radius * Math.sin(phi) * Math.cos(theta))
  const y = radius * Math.cos(phi)
  const z = radius * Math.sin(phi) * Math.sin(theta)

  return [x, y, z]
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
        <sphereGeometry args={[2.22, 96, 96]} />
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
        <sphereGeometry args={[2.3, 72, 72]} />
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

function LedNodes({
  points,
  onCountrySelect,
  hoveredCountryKey,
  onCountryHover,
}: {
  points: GlobePoint[]
  onCountrySelect?: (country: string) => void
  hoveredCountryKey: string | null
  onCountryHover?: (country: string | null) => void
}) {
  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [])

  return (
    <>
      {points.map((point) => {
        const isHovered = hoveredCountryKey === normalizeCountryName(point.country)
        const isActive = point.isActive || isHovered
        const stemColor = point.isActive ? '#c9a84c' : '#4db89e'
        const glowColor = point.isActive ? '#c9a84c' : '#4db89e'
        const ringColor = point.isActive ? '#c9a84c' : '#53bfa5'
        const nodeColor = point.isActive ? '#ffe2a0' : '#99f2d5'
        const hoverKey = normalizeCountryName(point.country)

        return (
          <group key={point.country}>
            <Line
              points={[point.anchorPosition, point.markerPosition]}
              color={stemColor}
              transparent
              opacity={point.isActive ? 0.72 : 0.48}
              lineWidth={1.2}
            />

            <Billboard follow position={point.markerPosition}>
              <group scale={isHovered ? 1.16 : 1}>
                <mesh position={[0, -0.01, -0.01]}>
                  <circleGeometry args={[point.glowRadiusWorld * 1.26, 26]} />
                  <meshBasicMaterial color="#020a08" transparent opacity={0.3} depthWrite={false} toneMapped={false} />
                </mesh>
                <mesh position={[0, 0, -0.004]}>
                  <circleGeometry args={[point.glowRadiusWorld, 32]} />
                  <meshBasicMaterial
                    color={glowColor}
                    transparent
                    opacity={isActive ? 0.28 : 0.18}
                    depthWrite={false}
                    toneMapped={false}
                  />
                </mesh>
                <mesh position={[0, 0, -0.001]}>
                  <ringGeometry args={[point.glowRadiusWorld * 0.65, point.glowRadiusWorld * 0.9, 32]} />
                  <meshBasicMaterial
                    color={ringColor}
                    transparent
                    opacity={isActive ? 0.92 : 0.76}
                    depthWrite={false}
                    toneMapped={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>

                <mesh
                  position={[0, 0, 0.006]}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerOver={(event) => {
                    event.stopPropagation()
                    onCountryHover?.(hoverKey)
                    document.body.style.cursor = 'pointer'
                  }}
                  onPointerOut={(event) => {
                    event.stopPropagation()
                    document.body.style.cursor = 'auto'
                    onCountryHover?.(null)
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onCountrySelect?.(point.country)
                  }}
                >
                  <circleGeometry args={[point.glowRadiusWorld * 1.08, 32]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} toneMapped={false} />
                </mesh>

                <mesh position={[0, 0, 0.005]}>
                  <circleGeometry args={[point.nodeRadiusWorld, 30]} />
                  <meshBasicMaterial
                    color={nodeColor}
                    transparent
                    opacity={point.isActive ? 1 : 0.9}
                    depthWrite={false}
                    toneMapped={false}
                  />
                </mesh>
              </group>
            </Billboard>
          </group>
        )
      })}
    </>
  )
}

export default function MapSection({ countryData, onCountrySelect, activeCountry }: Props) {
  const activeCountryKey = normalizeCountryName(activeCountry ?? '')
  const [hoveredCountryKey, setHoveredCountryKey] = useState<string | null>(null)
  const maxCount = Math.max(...countryData.map((item) => item.count || 0), 1)
  const totalCount = Math.max(countryData.reduce((sum, item) => sum + (item.count || 0), 0), 1)
  const rankByCountryKey = useMemo(() => {
    const sorted = [...countryData]
      .filter((entry) => (entry.count || 0) > 0)
      .sort((a, b) => (b.count || 0) - (a.count || 0))
    const ranking = new Map<string, number>()
    sorted.forEach((entry, index) => {
      ranking.set(normalizeCountryName(entry.country), index + 1)
    })
    return ranking
  }, [countryData])

  const points = useMemo<GlobePoint[]>(() => {
    return countryData.flatMap((entry) => {
      const key = normalizeCountryName(entry.country)
      const coords = COUNTRY_COORDS_BY_KEY.get(key)
      if (!coords) return []

      const [lat, lon] = coords
      const intensity = Math.sqrt((entry.count || 0) / maxCount)
      const nodeRadiusWorld = 0.042 + intensity * 0.03 + (activeCountryKey === key ? 0.008 : 0)
      const glowRadiusWorld = nodeRadiusWorld * 1.72
      const anchorPosition = latLonToVector3(lat, lon, 2.24)
      const normal = new THREE.Vector3(anchorPosition[0], anchorPosition[1], anchorPosition[2]).normalize()
      const markerLift = 0.18 + intensity * 0.1 + (activeCountryKey === key ? 0.035 : 0)
      const markerPosition: [number, number, number] = [
        anchorPosition[0] + normal.x * markerLift,
        anchorPosition[1] + normal.y * markerLift,
        anchorPosition[2] + normal.z * markerLift,
      ]

      return [{
        country: entry.country,
        count: entry.count,
        sharePct: (entry.count / totalCount) * 100,
        rank: rankByCountryKey.get(key) ?? countryData.length,
        anchorPosition,
        markerPosition,
        isActive: activeCountryKey === key,
        nodeRadiusWorld,
        glowRadiusWorld,
      }]
    })
  }, [activeCountryKey, countryData, maxCount, rankByCountryKey, totalCount])

  const hoveredPoint = useMemo(() => {
    if (!hoveredCountryKey) return null
    return points.find((point) => normalizeCountryName(point.country) === hoveredCountryKey) ?? null
  }, [hoveredCountryKey, points])

  const activePoint = useMemo(() => {
    if (!activeCountryKey) return null
    return points.find((point) => normalizeCountryName(point.country) === activeCountryKey) ?? null
  }, [activeCountryKey, points])

  const infoPoint = hoveredPoint ?? activePoint
  const infoStateLabel = hoveredPoint ? 'HOVER' : activePoint ? 'VALGT' : null

  return (
    <div className="relative w-full h-[430px] md:h-[460px] rounded-xl overflow-hidden border border-[var(--csub-light-soft)] shadow-lg bg-[#071610]">
      <Canvas camera={{ position: [0, 0, 7.4], fov: 38 }} dpr={[1, 2]}>
        <color attach="background" args={['#0a211b']} />
        <ambientLight intensity={1.05} />
        <hemisphereLight args={['#b7e9dd', '#0b1d18', 0.8]} />
        <directionalLight position={[7, 5, 4]} intensity={1.4} color="#b9ece0" />
        <directionalLight position={[-6, -4, -5]} intensity={0.55} color="#4db89e" />

        <Stars radius={70} depth={30} count={1100} factor={2} saturation={0} fade speed={0.25} />
        <EarthGlobe />
        <LedNodes
          points={points}
          onCountrySelect={onCountrySelect}
          hoveredCountryKey={hoveredCountryKey}
          onCountryHover={setHoveredCountryKey}
        />

        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={4.5}
          maxDistance={9.3}
          rotateSpeed={0.65}
          zoomSpeed={0.65}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>

      {infoPoint && (
        <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-[var(--csub-gold-soft)] bg-[rgba(8,20,17,0.9)] px-3 py-2.5 text-[11px] leading-snug text-gray-100 shadow-[0_8px_22px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          {infoStateLabel && (
            <div className="mb-1 text-[9px] uppercase tracking-[0.14em] text-[var(--csub-light)]">{infoStateLabel}</div>
          )}
          <div className="text-sm font-semibold text-white">{infoPoint.country}</div>
          <div className="mt-1 text-[var(--csub-light)]">
            {infoPoint.count.toLocaleString('en-US')} prosjekter
          </div>
          <div className="text-[var(--text-muted)]">
            {infoPoint.sharePct.toFixed(1)}% av total • Rang #{infoPoint.rank}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-[var(--csub-light-soft)] bg-[rgba(8,20,17,0.8)] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
        Hold mouse to rotate globe
      </div>
    </div>
  )
}
