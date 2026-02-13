'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { CameraControls, Float, Html, Line, Sparkles, Stars, type CameraControlsImpl } from '@react-three/drei'
import * as THREE from 'three'

export type IntelCategory = 'Contract' | 'Prediction' | 'Timeline' | 'Company'

export interface IntelItem {
  id: string
  title: string
  category: IntelCategory
  client: string
  value: string
  status: string
  date: string
  position: [number, number, number]
  summary: string
  connections: string[]
  tags?: string[]
  signal?: number
}

const CATEGORY_COLORS: Record<IntelCategory, string> = {
  Contract: '#21d4a8',
  Prediction: '#60a5fa',
  Timeline: '#d946ef',
  Company: '#f59e0b',
}

const CATEGORY_LABELS: Record<IntelCategory, string> = {
  Contract: 'Contracts',
  Prediction: 'Predictions',
  Timeline: 'Timeline',
  Company: 'Core',
}

const CATEGORY_HINTS: Record<IntelCategory, string> = {
  Contract: 'Live contract nodes from dashboard records',
  Prediction: 'Forecast metrics and forward models',
  Timeline: 'Reports, briefs and chronological intel',
  Company: 'Central CSUB intelligence core',
}

const CATEGORY_ICONS: Record<IntelCategory, string> = {
  Contract: '▣',
  Prediction: '◍',
  Timeline: '◆',
  Company: '◎',
}

const CATEGORY_ORDER: IntelCategory[] = ['Contract', 'Prediction', 'Timeline']

const INITIAL_VISIBILITY: Record<IntelCategory, boolean> = {
  Contract: true,
  Prediction: true,
  Timeline: true,
  Company: true,
}

function parseYear(value: string): number | null {
  const match = value.match(/\b(19|20)\d{2}\b/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function hashOffset(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) % 10_000
  return (hash % 100) / 100
}

function NodeGeometry({ category }: { category: IntelCategory }) {
  if (category === 'Prediction') return <sphereGeometry args={[0.92, 24, 24]} />
  if (category === 'Timeline') return <boxGeometry args={[1.32, 1.32, 1.32]} />
  if (category === 'Company') return <icosahedronGeometry args={[1.28, 1]} />
  return <octahedronGeometry args={[1.08, 1]} />
}

function CoreHalo() {
  const haloRef = useRef<THREE.Group | null>(null)

  useFrame((state) => {
    if (!haloRef.current) return
    const t = state.clock.elapsedTime
    haloRef.current.rotation.y = t * 0.16
    haloRef.current.rotation.x = Math.sin(t * 0.2) * 0.08
  })

  return (
    <group ref={haloRef} position={[0, 0, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[4.5, 0.08, 24, 120]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0.8, 0]}>
        <torusGeometry args={[6.8, 0.06, 20, 100]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.4} />
      </mesh>
      <mesh rotation={[0.6, Math.PI / 2, 0]}>
        <torusGeometry args={[8.2, 0.04, 20, 100]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.28} />
      </mesh>
      <Sparkles color="#7dd3fc" count={90} speed={0.35} opacity={0.8} size={3} scale={[18, 18, 18]} />
    </group>
  )
}

function ConnectionLines({
  data,
  activeId,
  dimmedIds,
}: {
  data: IntelItem[]
  activeId: string | null
  dimmedIds: Set<string>
}) {
  const lines = useMemo(() => {
    const knownIds = new Set(data.map((item) => item.id))
    const unique = new Set<string>()
    const result: Array<{
      start: [number, number, number]
      end: [number, number, number]
      color: string
      opacity: number
      lineWidth: number
    }> = []

    data.forEach((node) => {
      if (dimmedIds.has(node.id)) return

      node.connections.forEach((targetId) => {
        if (!knownIds.has(targetId) || dimmedIds.has(targetId)) return
        const key = node.id < targetId ? `${node.id}:${targetId}` : `${targetId}:${node.id}`
        if (unique.has(key)) return
        unique.add(key)

        const target = data.find((item) => item.id === targetId)
        if (!target) return

        const isActive = activeId === node.id || activeId === targetId
        result.push({
          start: node.position,
          end: target.position,
          color: isActive ? CATEGORY_COLORS[node.category] : '#0f2334',
          opacity: isActive ? 0.95 : 0.28,
          lineWidth: isActive ? 1.8 : 0.55,
        })
      })
    })

    return result
  }, [activeId, data, dimmedIds])

  return (
    <group>
      {lines.map((line, index) => (
        <Line
          key={`${line.start.join('-')}:${line.end.join('-')}:${index}`}
          points={[line.start, line.end]}
          color={line.color}
          lineWidth={line.lineWidth}
          transparent
          opacity={line.opacity}
        />
      ))}
    </group>
  )
}

function IntelNode({
  node,
  isActive,
  isDimmed,
  onSelect,
}: {
  node: IntelItem
  isActive: boolean
  isDimmed: boolean
  onSelect: (item: IntelItem) => void
}) {
  const groupRef = useRef<THREE.Group | null>(null)
  const ringRef = useRef<THREE.Mesh | null>(null)
  const pulseRef = useRef<THREE.Mesh | null>(null)
  const [hovered, setHovered] = useState(false)

  const color = CATEGORY_COLORS[node.category]
  const isCore = node.category === 'Company'
  const idOffset = hashOffset(node.id)
  const baseScale = isCore ? 1.55 : node.category === 'Prediction' ? 1.06 : node.category === 'Timeline' ? 1.12 : 1

  useFrame((state) => {
    const t = state.clock.elapsedTime

    if (groupRef.current) {
      groupRef.current.rotation.y += isCore ? 0.005 : 0.012
      groupRef.current.rotation.x += isCore ? 0.0025 : 0.004
      if (isCore) groupRef.current.position.y = Math.sin(t * 0.8) * 1.2
    }

    if (ringRef.current) {
      ringRef.current.rotation.z += 0.018
      ringRef.current.rotation.x = Math.sin(t + idOffset * 6) * 0.28
    }

    if (pulseRef.current) {
      const material = pulseRef.current.material as THREE.MeshBasicMaterial
      const pulse = 0.12 + ((Math.sin(t * 2.6 + idOffset * 10) + 1) / 2) * 0.24
      material.opacity = isDimmed ? 0.02 : pulse
    }
  })

  const effectiveScale = isActive ? baseScale * 1.36 : hovered ? baseScale * 1.2 : baseScale

  return (
    <group position={node.position}>
      <Float speed={isCore ? 1 : 1.9} rotationIntensity={isCore ? 0.5 : 0.95} floatIntensity={isCore ? 0.6 : 1.1}>
        <group ref={groupRef}>
          <mesh
            onClick={(event) => {
              event.stopPropagation()
              onSelect(node)
            }}
            onPointerOver={(event) => {
              event.stopPropagation()
              setHovered(true)
              if (typeof document !== 'undefined') document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              setHovered(false)
              if (typeof document !== 'undefined') document.body.style.cursor = 'auto'
            }}
            scale={effectiveScale}
          >
            <NodeGeometry category={node.category} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={isActive ? 2.2 : hovered ? 1.2 : 0.55}
              roughness={node.category === 'Prediction' ? 0.12 : 0.28}
              metalness={node.category === 'Prediction' ? 0.84 : 0.72}
              transparent
              opacity={isDimmed ? 0.08 : 0.94}
            />
          </mesh>

          <mesh ref={pulseRef} scale={effectiveScale * (isCore ? 2.25 : 1.9)}>
            <sphereGeometry args={[1, 22, 22]} />
            <meshBasicMaterial color={color} transparent opacity={isDimmed ? 0.02 : 0.24} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>

          <mesh ref={ringRef} scale={effectiveScale * (isCore ? 2.8 : 2.15)} rotation={[Math.PI / 2, 0, idOffset]}>
            <torusGeometry args={[1, 0.04, 16, 68]} />
            <meshBasicMaterial color={color} transparent opacity={isDimmed ? 0.03 : 0.58} />
          </mesh>

          <mesh scale={effectiveScale * 1.5}>
            <NodeGeometry category={node.category} />
            <meshBasicMaterial color={color} wireframe transparent opacity={isDimmed ? 0.02 : 0.22} />
          </mesh>
        </group>

        {(hovered || isActive || isCore) && !isDimmed && (
          <Html distanceFactor={20} center zIndexRange={[120, 0]}>
            <div className={`pointer-events-none whitespace-nowrap rounded-xl border px-3 py-2 backdrop-blur-md transition-all ${isActive ? 'bg-slate-950/92 border-white/35 shadow-[0_0_18px_rgba(148,163,184,0.35)] scale-105' : 'bg-slate-950/78 border-white/15'}`}>
              <p className="text-xs font-semibold text-white">{node.title}</p>
              <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em]">
                <span style={{ color }} className="font-mono">{CATEGORY_LABELS[node.category]}</span>
                <span className="text-slate-500">{node.date}</span>
              </div>
            </div>
          </Html>
        )}
      </Float>
    </group>
  )
}

interface IntelSpace3DProps {
  onClose: () => void
  initialData?: IntelItem[]
}

export default function IntelSpace3D({ onClose, initialData }: IntelSpace3DProps) {
  const data = useMemo(() => {
    if (initialData && initialData.length > 0) return initialData

    const fallback: IntelItem[] = []
    const contractNames = ['Goliat', 'Balder Future', 'Johan Castberg', 'Fenja', 'Marlim']

    for (let i = 0; i < 14; i++) {
      const t = (i / 14) * Math.PI * 2
      fallback.push({
        id: `contract-${i}`,
        title: `${contractNames[i % contractNames.length]} Contract ${i + 1}`,
        category: 'Contract',
        client: ['Equinor', 'Aker BP', 'Vaar Energi'][i % 3],
        value: `$${(40 + i * 4).toFixed(0)}M`,
        status: i % 2 === 0 ? 'Awarded' : 'Pipeline',
        date: `${2021 + (i % 6)}`,
        summary: 'Contract signal captured from the project pipeline and historical records.',
        position: [Math.cos(t) * 22, ((i % 6) - 2.5) * 2.2, Math.sin(t) * 22],
        connections: ['hub'],
        tags: ['contract', 'pipeline'],
      })
    }

    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * Math.PI * 2
      fallback.push({
        id: `prediction-${i}`,
        title: `Forecast ${2026 + i} / Spend`,
        category: 'Prediction',
        client: 'Market model',
        value: `$${(7.2 + i * 0.4).toFixed(1)}B`,
        status: 'Modelled',
        date: `${2026 + i}`,
        summary: 'Forecast node synthesized from latest AI reports and market metrics.',
        position: [Math.cos(t) * 14, 16 + (i % 4) * 1.2, Math.sin(t) * 14],
        connections: ['hub', `contract-${i % 8}`],
        tags: ['forecast', 'prediction', 'capex'],
      })
    }

    for (let i = 0; i < 8; i++) {
      const t = (i / Math.max(1, 7)) * Math.PI * 1.7 - Math.PI * 0.85
      fallback.push({
        id: `timeline-${i}`,
        title: `Report Pulse ${i + 1}`,
        category: 'Timeline',
        client: 'Intel report',
        value: 'AI summary',
        status: 'Filed',
        date: `${2020 + i}`,
        summary: 'Timeline node generated from uploaded reports and extracted highlights.',
        position: [Math.sin(t) * 27, -13 - (i % 3) * 1.7, Math.cos(t) * 18],
        connections: ['hub', `prediction-${i % 7}`],
        tags: ['timeline', 'report'],
      })
    }

    fallback.push({
      id: 'hub',
      title: 'CSUB CORE',
      category: 'Company',
      client: 'Internal',
      value: `${fallback.length} signals`,
      status: 'Active',
      date: String(new Date().getFullYear()),
      summary: 'Central command node for contracts, predictions and timeline intelligence.',
      position: [0, 0, 0],
      connections: fallback.slice(0, 12).map((item) => item.id),
      tags: ['core', 'hub'],
      signal: 100,
    })

    return fallback
  }, [initialData])

  const [searchQuery, setSearchQuery] = useState('')
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [visibleCategories, setVisibleCategories] = useState<Record<IntelCategory, boolean>>({ ...INITIAL_VISIBILITY })
  const [focusCategory, setFocusCategory] = useState<IntelCategory | 'All'>('All')
  const cameraControlsRef = useRef<CameraControlsImpl | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (typeof document !== 'undefined') document.body.style.cursor = 'auto'
    }
  }, [onClose])

  const nodeById = useMemo(() => new Map(data.map((item) => [item.id, item])), [data])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const matchesSearch = useCallback((item: IntelItem): boolean => {
    if (!normalizedQuery) return true
    const haystack = [
      item.title,
      item.client,
      item.value,
      item.status,
      item.date,
      item.summary,
      ...(item.tags ?? []),
      CATEGORY_LABELS[item.category],
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedQuery)
  }, [normalizedQuery])

  const visibleIds = useMemo(() => {
    const ids = new Set<string>()

    data.forEach((item) => {
      if (item.category === 'Company') {
        ids.add(item.id)
        return
      }

      if (!visibleCategories[item.category]) return
      if (focusCategory !== 'All' && item.category !== focusCategory) return
      if (!matchesSearch(item)) return

      ids.add(item.id)
    })

    return ids
  }, [data, focusCategory, matchesSearch, visibleCategories])

  const resolvedActiveNodeId = activeNodeId && visibleIds.has(activeNodeId) ? activeNodeId : null

  const activeNode = useMemo(() => {
    if (!resolvedActiveNodeId) return null
    return nodeById.get(resolvedActiveNodeId) ?? null
  }, [nodeById, resolvedActiveNodeId])

  const dimmedIds = useMemo(() => {
    const dimmed = new Set<string>()

    data.forEach((item) => {
      if (!visibleIds.has(item.id)) dimmed.add(item.id)
    })

    if (!activeNode) return dimmed

    data.forEach((item) => {
      if (dimmed.has(item.id)) return
      if (item.id === activeNode.id) return
      if (activeNode.connections.includes(item.id) || item.connections.includes(activeNode.id)) return
      dimmed.add(item.id)
    })

    return dimmed
  }, [activeNode, data, visibleIds])

  const categoryStats = useMemo(() => {
    return CATEGORY_ORDER.map((category) => {
      const total = data.filter((item) => item.category === category).length
      const visible = data.filter((item) => item.category === category && visibleIds.has(item.id)).length
      return { category, total, visible }
    })
  }, [data, visibleIds])

  const visibleNodes = useMemo(() => data.filter((item) => visibleIds.has(item.id)), [data, visibleIds])

  const timelineBuckets = useMemo(() => {
    const buckets = new Map<number, { year: number; count: number; contract: number; prediction: number; timeline: number }>()

    visibleNodes.forEach((item) => {
      if (item.category === 'Company') return
      const year = parseYear(item.date)
      if (!year) return

      if (!buckets.has(year)) {
        buckets.set(year, { year, count: 0, contract: 0, prediction: 0, timeline: 0 })
      }

      const entry = buckets.get(year)!
      entry.count += 1
      if (item.category === 'Contract') entry.contract += 1
      if (item.category === 'Prediction') entry.prediction += 1
      if (item.category === 'Timeline') entry.timeline += 1
    })

    return Array.from(buckets.values()).sort((a, b) => a.year - b.year).slice(-12)
  }, [visibleNodes])

  const linkedNodes = useMemo(() => {
    if (!activeNode) return []
    return activeNode.connections
      .map((id) => nodeById.get(id))
      .filter((item): item is IntelItem => Boolean(item))
      .slice(0, 6)
  }, [activeNode, nodeById])

  const quickMatches = useMemo(() => {
    if (!normalizedQuery) return []
    return data
      .filter((item) => item.category !== 'Company' && matchesSearch(item))
      .slice(0, 6)
  }, [data, matchesSearch, normalizedQuery])

  const totalConnections = useMemo(() => {
    const count = data.reduce((sum, item) => sum + item.connections.length, 0)
    return Math.round(count / 2)
  }, [data])

  const handleBackgroundClick = () => {
    setActiveNodeId(null)
    cameraControlsRef.current?.setLookAt(0, 0, 76, 0, 0, 0, true)
  }

  const handleSelectNode = (item: IntelItem) => {
    setActiveNodeId(item.id)
    const [x, y, z] = item.position
    const zOffset = item.category === 'Company' ? 30 : 18
    cameraControlsRef.current?.setLookAt(x + 8, y + 5, z + zOffset, x, y, z, true)
  }

  const toggleCategory = (category: IntelCategory) => {
    setVisibleCategories((previous) => {
      const next = { ...previous, [category]: !previous[category] }
      const hasAnyVisible = CATEGORY_ORDER.some((cat) => next[cat])
      if (!hasAnyVisible) next[category] = true
      return next
    })
  }

  const resetFilters = () => {
    setVisibleCategories({ ...INITIAL_VISIBILITY })
    setFocusCategory('All')
    setSearchQuery('')
    setActiveNodeId(null)
  }

  const maxBucketCount = timelineBuckets.length ? Math.max(...timelineBuckets.map((item) => item.count)) : 0

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden bg-[#020612] text-slate-100">
      <div className="absolute inset-0">
        <div className="absolute -left-36 -top-28 h-96 w-96 rounded-full bg-cyan-500/15 blur-[120px]" />
        <div className="absolute right-[-140px] top-[24%] h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/12 blur-[140px]" />
        <div className="absolute left-[35%] bottom-[-180px] h-[24rem] w-[24rem] rounded-full bg-emerald-400/12 blur-[120px]" />
      </div>

      <div className="absolute inset-0 cursor-grab active:cursor-grabbing">
        <Canvas camera={{ position: [0, 0, 76], fov: 46 }} onPointerMissed={handleBackgroundClick}>
          <color attach="background" args={['#020612']} />
          <fog attach="fog" args={['#020612', 55, 130]} />
          <ambientLight intensity={0.33} />
          <pointLight position={[24, 28, 25]} intensity={2.2} color="#9ee7ff" />
          <pointLight position={[-28, -18, -25]} intensity={1.6} color="#6d7cff" />
          <pointLight position={[0, -26, 0]} intensity={1.1} color="#1cc8a7" />

          <Stars radius={180} depth={70} count={8600} factor={4.4} saturation={0} fade speed={0.9} />
          <CoreHalo />
          <ConnectionLines data={data} activeId={activeNode?.id ?? null} dimmedIds={dimmedIds} />

          {data.map((item) => (
            <IntelNode
              key={item.id}
              node={item}
              isActive={activeNode?.id === item.id}
              isDimmed={dimmedIds.has(item.id)}
              onSelect={handleSelectNode}
            />
          ))}

          <CameraControls ref={cameraControlsRef} maxDistance={170} minDistance={6} dollySpeed={0.55} truckSpeed={1.2} makeDefault />
        </Canvas>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none p-4 md:p-6 lg:p-8 flex flex-col gap-4">
        <div className="pointer-events-auto rounded-2xl border border-cyan-400/20 bg-slate-950/65 backdrop-blur-xl px-4 py-3 shadow-[0_0_40px_rgba(14,116,144,0.25)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="grid h-11 w-11 place-items-center rounded-xl border border-slate-700 bg-slate-900/80 text-slate-200 hover:border-cyan-300/50 hover:text-white transition-colors"
                title="Return to Dashboard"
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl md:text-2xl font-black tracking-[0.08em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400">
                  CSUB INTEL NEXUS
                </h1>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400 mt-0.5">Contracts • Predictions • Timeline</p>
              </div>
            </div>

            <div className="flex w-full lg:w-auto items-center gap-2">
              <div className="relative w-full lg:w-[390px]">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search projects, operators, reports, metrics..."
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    setActiveNodeId(null)
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 py-2.5 pl-10 pr-16 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-slate-800 px-2 py-1 text-[10px] font-mono text-slate-400">
                  {visibleNodes.length}
                </span>
              </div>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-xl border border-slate-700 bg-slate-900/75 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300 hover:border-cyan-300/50 hover:text-white transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <section className="pointer-events-auto rounded-2xl border border-slate-700/70 bg-slate-950/65 backdrop-blur-xl p-4 shadow-xl overflow-auto max-h-[42vh] xl:max-h-none">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.24em] text-slate-400">Signal Lanes</h2>
              <span className="text-[11px] text-slate-500">{data.length - 1} nodes</span>
            </div>
            <div className="mt-3 space-y-3">
              {categoryStats.map((item) => {
                const category = item.category
                const isFocused = focusCategory === category
                const color = CATEGORY_COLORS[category]
                return (
                  <div key={category} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm" style={{ color }}>{CATEGORY_ICONS[category]}</span>
                          <p className="text-sm font-semibold text-white">{CATEGORY_LABELS[category]}</p>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{CATEGORY_HINTS[category]}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-slate-400">Visible</p>
                        <p className="font-mono text-sm text-white">{item.visible}/{item.total}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${visibleCategories[category] ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                      >
                        {visibleCategories[category] ? 'Shown' : 'Hidden'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFocusCategory(isFocused ? 'All' : category)}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${isFocused ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
                      >
                        {isFocused ? 'Focused' : 'Focus'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Network Stats</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2">
                  <p className="text-slate-500">Visible nodes</p>
                  <p className="mt-1 font-mono text-white">{visibleNodes.length}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2">
                  <p className="text-slate-500">Connections</p>
                  <p className="mt-1 font-mono text-white">{totalConnections}</p>
                </div>
              </div>
            </div>
          </section>

          <div />

          <section className="pointer-events-auto rounded-2xl border border-slate-700/70 bg-slate-950/65 backdrop-blur-xl p-4 shadow-xl overflow-auto max-h-[46vh] xl:max-h-none">
            {activeNode ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]" style={{ color: CATEGORY_COLORS[activeNode.category], borderColor: `${CATEGORY_COLORS[activeNode.category]}66`, backgroundColor: `${CATEGORY_COLORS[activeNode.category]}14` }}>
                      <span>{CATEGORY_ICONS[activeNode.category]}</span>
                      {CATEGORY_LABELS[activeNode.category]}
                    </span>
                    <h2 className="mt-3 text-xl font-bold text-white leading-tight">{activeNode.title}</h2>
                    <p className="mt-1 text-sm text-slate-400">{activeNode.client}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveNodeId(null)}
                    className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-400 hover:text-white"
                    aria-label="Close details"
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Value</p>
                    <p className="mt-1 font-mono text-base text-white">{activeNode.value}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Status</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-300">{activeNode.status}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 col-span-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Date</p>
                    <p className="mt-1 font-mono text-sm text-slate-200">{activeNode.date}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Intelligence Brief</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{activeNode.summary}</p>
                </div>

                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Connected Signals</p>
                  <div className="mt-2 space-y-2">
                    {linkedNodes.length > 0 ? (
                      linkedNodes.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectNode(item)}
                          className="w-full rounded-md border border-slate-800 bg-slate-900/80 px-2.5 py-2 text-left text-xs text-slate-300 hover:border-cyan-300/40 hover:text-white transition-colors"
                        >
                          <span style={{ color: CATEGORY_COLORS[item.category] }}>{CATEGORY_ICONS[item.category]}</span>
                          <span className="ml-2">{item.title}</span>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">No direct links on this node.</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xs uppercase tracking-[0.24em] text-slate-400">Intel Focus</h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  Select any node to open detailed contract context, prediction metrics, and timeline references.
                </p>

                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Current Scope</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-slate-800 bg-slate-900/80 p-2">
                      <p className="text-slate-500">Search query</p>
                      <p className="mt-1 truncate text-slate-200">{searchQuery.trim() || 'none'}</p>
                    </div>
                    <div className="rounded-md border border-slate-800 bg-slate-900/80 p-2">
                      <p className="text-slate-500">Focused lane</p>
                      <p className="mt-1 text-slate-200">{focusCategory === 'All' ? 'All' : CATEGORY_LABELS[focusCategory]}</p>
                    </div>
                  </div>
                </div>

                {quickMatches.length > 0 && (
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Top Matches</p>
                    <div className="mt-2 space-y-2">
                      {quickMatches.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectNode(item)}
                          className="w-full rounded-md border border-slate-800 bg-slate-900/80 px-2.5 py-2 text-left text-xs text-slate-300 hover:border-cyan-300/40 hover:text-white transition-colors"
                        >
                          <span style={{ color: CATEGORY_COLORS[item.category] }}>{CATEGORY_ICONS[item.category]}</span>
                          <span className="ml-2">{item.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <section className="pointer-events-auto rounded-2xl border border-slate-700/70 bg-slate-950/65 backdrop-blur-xl px-4 py-3 shadow-xl">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Timeline Stream</p>
            <p className="text-[11px] text-slate-500">Sorted by visible data years</p>
          </div>

          {timelineBuckets.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">No timeline points in current filter scope.</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-12">
              {timelineBuckets.map((bucket) => {
                const ratio = maxBucketCount > 0 ? bucket.count / maxBucketCount : 0
                return (
                  <div key={bucket.year} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                    <p className="text-[10px] font-mono text-slate-500">{bucket.year}</p>
                    <div className="mt-1 h-14 rounded bg-slate-950/90 p-1 flex items-end">
                      <div
                        className="w-full rounded-sm bg-gradient-to-t from-cyan-500 via-sky-500 to-fuchsia-500"
                        style={{ height: `${Math.max(12, ratio * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">{bucket.count} signals</p>
                    <p className="text-[10px] text-slate-500">C {bucket.contract} • P {bucket.prediction} • T {bucket.timeline}</p>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
