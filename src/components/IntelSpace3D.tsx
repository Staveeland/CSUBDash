'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { CameraControls, Float, Html, Line, Stars, type CameraControlsImpl } from '@react-three/drei'
import * as THREE from 'three'

export interface IntelItem {
  id: string
  title: string
  category: 'Contract' | 'FEED' | 'Market Intel' | 'Company'
  client: string
  value: string
  status: string
  date: string
  position: [number, number, number]
  summary: string
  connections: string[]
}

const CATEGORY_COLORS: Record<IntelItem['category'], string> = {
  Contract: '#10b981',
  FEED: '#3b82f6',
  'Market Intel': '#a855f7',
  Company: '#f59e0b',
}

const generateMockData = (): IntelItem[] => {
  const categories: Array<Exclude<IntelItem['category'], 'Company'>> = ['Contract', 'FEED', 'Market Intel']
  const statuses = ['Awarded', 'Ongoing', 'Completed', 'Bidding', 'Analysis']
  const clients = ['Equinor', 'Aker BP', 'Subsea7', 'TechnipFMC', 'Var Energi', 'TotalEnergies', 'Shell', 'Chevron']

  const nodes: IntelItem[] = []
  const nodeCount = 75
  const phi = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < nodeCount; i++) {
    const y = 1 - (i / (nodeCount - 1)) * 2
    const radius = Math.sqrt(1 - y * y)
    const theta = phi * i
    const scale = 30 + Math.random() * 10

    const x = Math.cos(theta) * radius * scale
    const z = Math.sin(theta) * radius * scale

    const connections: string[] = []
    if (i > 0) {
      const numConnections = Math.floor(Math.random() * 3)
      for (let j = 0; j < numConnections; j++) {
        const targetId = `intel-${Math.floor(Math.random() * i)}`
        if (!connections.includes(targetId)) connections.push(targetId)
      }
    }

    nodes.push({
      id: `intel-${i}`,
      title: `${clients[Math.floor(Math.random() * clients.length)]} ${categories[i % 3].split(' ')[0]}`,
      category: categories[Math.floor(Math.random() * categories.length)],
      client: clients[Math.floor(Math.random() * clients.length)],
      value: `$${Math.floor(Math.random() * 400 + 10)}M`,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      date: `202${Math.floor(Math.random() * 4 + 4)}-0${Math.floor(Math.random() * 9 + 1)}`,
      summary: 'Strategic subsea intelligence gathered from market activities and reports. Critical for positioning and upcoming tenders.',
      position: [x, y * scale, z],
      connections,
    })
  }

  nodes.push({
    id: 'hub',
    title: 'CSUB CORE',
    category: 'Company',
    status: 'Active',
    value: 'HQ',
    client: 'Internal',
    date: 'Current',
    position: [0, 0, 0],
    connections: [],
    summary: 'CSUB main intelligence hub. Central point for all subsea market data.',
  })

  return nodes
}

function ConnectionLines({
  data,
  activeId,
  isFaded,
}: {
  data: IntelItem[]
  activeId: string | null
  isFaded: (id: string) => boolean
}) {
  const lines = useMemo(() => {
    const arr: { start: [number, number, number]; end: [number, number, number]; color: string; isActive: boolean }[] = []

    data.forEach((node) => {
      if (isFaded(node.id)) return
      node.connections.forEach((targetId) => {
        if (isFaded(targetId)) return
        const target = data.find((candidate) => candidate.id === targetId)
        if (!target) return

        const isActive = activeId === node.id || activeId === targetId
        arr.push({
          start: node.position,
          end: target.position,
          color: isActive ? CATEGORY_COLORS[node.category] : '#1e293b',
          isActive,
        })
      })
    })

    for (let i = 0; i < data.length; i++) {
      if (isFaded(data[i].id)) continue
      for (let j = i + 1; j < data.length; j++) {
        if (isFaded(data[j].id)) continue
        const dist = new THREE.Vector3(...data[i].position).distanceTo(new THREE.Vector3(...data[j].position))
        if (dist >= 12) continue

        const isActive = activeId === data[i].id || activeId === data[j].id
        arr.push({
          start: data[i].position,
          end: data[j].position,
          color: isActive ? CATEGORY_COLORS[data[i].category] : '#0f172a',
          isActive,
        })
      }
    }

    return arr
  }, [activeId, data, isFaded])

  return (
    <group>
      {lines.map((line, idx) => (
        <Line
          key={`${line.start.join('-')}-${line.end.join('-')}-${idx}`}
          points={[line.start, line.end]}
          color={line.color}
          lineWidth={line.isActive ? 2 : 0.5}
          transparent
          opacity={line.isActive ? 0.8 : 0.15}
        />
      ))}
    </group>
  )
}

function IntelNode({
  data,
  isActive,
  isFaded,
  onClick,
}: {
  data: IntelItem
  isActive: boolean
  isFaded: boolean
  onClick: (item: IntelItem) => void
}) {
  const meshRef = useRef<THREE.Mesh | null>(null)
  const [hovered, setHovered] = useState(false)
  const color = CATEGORY_COLORS[data.category] || '#ffffff'
  const isHub = data.id === 'hub'

  useFrame((state) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y += isHub ? 0.005 : 0.01
    meshRef.current.rotation.x += 0.005
    if (isHub) meshRef.current.position.y = Math.sin(state.clock.elapsedTime) * 1.5
  })

  return (
    <group position={data.position}>
      <Float speed={isHub ? 1 : 2} rotationIntensity={isHub ? 0.5 : 1} floatIntensity={isHub ? 0.5 : 1.5}>
        <mesh
          ref={meshRef}
          onClick={(event) => {
            event.stopPropagation()
            onClick(data)
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
          scale={isHub ? 4 : isActive ? 2 : hovered ? 1.5 : 1}
        >
          {isHub ? <icosahedronGeometry args={[1, 1]} /> : <octahedronGeometry args={[1, 0]} />}
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={isActive ? 2 : hovered ? 1 : 0.4}
            wireframe={!isActive && !hovered && !isHub}
            transparent
            opacity={isFaded ? 0.02 : 0.9}
          />
        </mesh>

        {(isActive || hovered || isHub) && !isFaded && (
          <Html distanceFactor={20} center zIndexRange={[100, 0]}>
            <div
              className={`px-4 py-2 rounded-xl backdrop-blur-xl border transition-all duration-300 pointer-events-none whitespace-nowrap ${
                isActive
                  ? 'bg-slate-900/90 border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.1)] scale-110'
                  : 'bg-slate-900/60 border-white/10 scale-100'
              }`}
            >
              <div className="text-white font-bold text-sm drop-shadow-md">{data.title}</div>
              <div className="text-[10px] font-mono mt-1 uppercase tracking-widest" style={{ color }}>
                {data.category}
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
  const [data] = useState<IntelItem[]>(() => initialData || generateMockData())
  const [searchQuery, setSearchQuery] = useState('')
  const [activeNode, setActiveNode] = useState<IntelItem | null>(null)
  const cameraControlsRef = useRef<CameraControlsImpl | null>(null)

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') document.body.style.cursor = 'auto'
    }
  }, [])

  const filteredData = useMemo(() => {
    if (!searchQuery) return data
    const query = searchQuery.toLowerCase()
    return data.filter((item) => {
      return (
        item.title.toLowerCase().includes(query) ||
        item.client.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      )
    })
  }, [data, searchQuery])

  const filteredIdSet = useMemo(() => new Set(filteredData.map((item) => item.id)), [filteredData])
  const activeNodeId = activeNode?.id ?? null

  const isNodeFaded = (id: string): boolean => {
    if (searchQuery && !filteredIdSet.has(id)) return true
    if (activeNodeId && activeNodeId !== id) return true
    return false
  }

  const handleNodeClick = (node: IntelItem) => {
    setActiveNode(node)
    if (!cameraControlsRef.current) return

    cameraControlsRef.current.setLookAt(
      node.position[0] + 10,
      node.position[1] + 5,
      node.position[2] + 15,
      node.position[0],
      node.position[1],
      node.position[2],
      true
    )
  }

  const handleBackgroundClick = () => {
    setActiveNode(null)
    cameraControlsRef.current?.setLookAt(0, 0, 80, 0, 0, 0, true)
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[#020617] font-sans overflow-hidden animate-in fade-in duration-500">
      <div className="absolute inset-0 cursor-move">
        <Canvas camera={{ position: [0, 0, 80], fov: 45 }} onPointerMissed={handleBackgroundClick}>
          <color attach="background" args={['#020617']} />
          <ambientLight intensity={0.2} />
          <pointLight position={[30, 30, 30]} intensity={1.5} color="#ffffff" />
          <pointLight position={[-30, -30, -30]} intensity={1} color="#3b82f6" />

          <Stars radius={150} depth={50} count={7000} factor={4} saturation={0} fade speed={0.5} />

          <ConnectionLines data={data} activeId={activeNodeId} isFaded={isNodeFaded} />

          {data.map((item) => (
            <IntelNode
              key={item.id}
              data={item}
              isActive={activeNodeId === item.id}
              isFaded={isNodeFaded(item.id)}
              onClick={handleNodeClick}
            />
          ))}

          <CameraControls ref={cameraControlsRef} maxDistance={150} minDistance={2} dollySpeed={0.5} makeDefault />
        </Canvas>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none p-6 flex flex-col justify-between">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-6 pointer-events-auto">
            <button
              onClick={onClose}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-white backdrop-blur-xl transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)]"
              title="Return to Dashboard"
            >
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400 tracking-tighter drop-shadow-lg">
                CSUB DATA NEXUS
              </h1>
              <p className="text-slate-400 text-[10px] font-bold tracking-widest uppercase mt-1">3D Spatial Intelligence Matrix</p>
            </div>
          </div>

          <div className="relative pointer-events-auto w-full md:w-96">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search intel, clients, FEEDs..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setActiveNode(null)
              }}
              className="w-full bg-slate-900/80 backdrop-blur-xl border border-slate-700 text-white rounded-2xl pl-11 pr-16 py-3.5 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all placeholder-slate-500 shadow-2xl text-sm"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] font-bold bg-slate-800 px-2 py-1 rounded">
              {filteredData.length}
            </div>
          </div>
        </div>

        <div className="absolute top-24 right-6 bottom-6 w-full max-w-[400px] pointer-events-auto flex flex-col justify-end">
          <div
            className={`w-full bg-slate-900/80 backdrop-blur-2xl border border-slate-700 rounded-3xl p-6 shadow-2xl transform transition-all duration-500 ease-[cubic-bezier(0.19,1,0.22,1)] ${
              activeNode ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0'
            }`}
          >
            {activeNode && (
              <>
                <div className="flex justify-between items-start mb-5">
                  <span
                    className="px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border"
                    style={{
                      color: CATEGORY_COLORS[activeNode.category],
                      borderColor: CATEGORY_COLORS[activeNode.category],
                      backgroundColor: `${CATEGORY_COLORS[activeNode.category]}15`,
                    }}
                  >
                    {activeNode.category}
                  </span>
                  <button onClick={() => setActiveNode(null)} className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition-colors">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <h2 className="text-2xl font-bold text-white mb-1 leading-tight">{activeNode.title}</h2>
                <p className="text-sky-400 font-medium text-sm mb-6">{activeNode.client}</p>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
                    <div className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Est. Value</div>
                    <div className="text-white text-lg font-bold font-mono">{activeNode.value}</div>
                  </div>
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
                    <div className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mb-1">Status</div>
                    <div className="text-emerald-400 text-sm font-bold mt-1.5 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      {activeNode.status}
                    </div>
                  </div>
                </div>

                <div className="bg-black/30 border border-white/5 rounded-2xl p-5 mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Intelligence Brief</h3>
                    <span className="text-[10px] font-mono text-slate-500">{activeNode.date}</span>
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed">{activeNode.summary}</p>
                </div>

                <button className="w-full py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm rounded-xl transition-all shadow-[0_0_20px_rgba(14,165,233,0.3)] flex items-center justify-center gap-2 group">
                  Open Full Dossier
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="pointer-events-auto flex flex-wrap gap-3">
          {Object.entries(CATEGORY_COLORS).map(([category, color]) => (
            <div key={category} className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 px-4 py-2.5 rounded-2xl shadow-lg">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
              <span className="text-slate-300 text-[10px] font-bold uppercase tracking-widest">{category}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
