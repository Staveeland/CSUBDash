'use client'

import React, { useMemo, useRef, useState, useEffect, type CSSProperties } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  OrbitControls,
  Instances,
  Instance,
  Html,
  Text,
  Grid,
  MeshReflectorMaterial,
  Sparkles,
} from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

// ----------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------

export interface Dashboard3DProps {
  projects: Array<{
    development_project: string
    country: string
    continent: string
    operator: string
    surf_contractor: string
    facility_category: string
    water_depth_category: string
    xmt_count: number
    surf_km: number
    first_year: number
    last_year: number
  }>
  forecasts: Array<{
    year: number
    metric: string
    value: number
    unit: string
  }>
  reports: Array<{
    file_name: string
    ai_summary: string
    created_at: string
  }>
  onBack?: () => void
}

type ProjectNodeData = Dashboard3DProps['projects'][number] & {
  id: string
  basePos: THREE.Vector3
  scale: number
  colorHex: string
  glowColor: THREE.Color
  brightColor: THREE.Color
  dimColor: THREE.Color
  randomOffset: number
}

type ForecastPoint = Dashboard3DProps['forecasts'][number]
type ReportPoint = Dashboard3DProps['reports'][number]

// ----------------------------------------------------------------------
// CONSTANTS & THEME
// ----------------------------------------------------------------------

const THEME = {
  background: '#0a1714',
  primary: '#4db89e',
  accent: '#c9a84c',
  text: '#ffffff',
  muted: '#8ca8a0',
}

const CONTINENT_COLORS: Record<string, string> = {
  Europe: '#4db89e',
  'South America': '#c9a84c',
  'North America': '#e06c75',
  Africa: '#61afef',
  Asia: '#c678dd',
  'Middle East': '#d19a66',
}

const CONTINENT_CENTERS: Record<string, [number, number, number]> = {
  Europe: [0, 0, -20],
  'North America': [-25, 0, -10],
  'South America': [-25, 0, 15],
  Africa: [20, 0, -15],
  Asia: [25, 0, 10],
  'Middle East': [5, 0, 25],
}

const ORBIT_CENTER = new THREE.Vector3(0, 6, 0)
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 30, 80)

const getGlowColor = (hex: string, intensity = 2.5) => {
  const color = new THREE.Color(hex || THEME.muted)
  color.multiplyScalar(intensity)
  return color
}

function seededValue(input: string, salt = 0): number {
  let hash = 2166136261 ^ salt
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 10000) / 10000
}

// ----------------------------------------------------------------------
// SUB-COMPONENTS (3D)
// ----------------------------------------------------------------------

function EmptyState() {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (!meshRef.current) return
    meshRef.current.rotation.x = state.clock.elapsedTime * 0.5
    meshRef.current.rotation.y = state.clock.elapsedTime * 0.5
  })

  return (
    <group>
      <mesh ref={meshRef}>
        <boxGeometry args={[4, 4, 4]} />
        <meshBasicMaterial color={THEME.primary} wireframe toneMapped={false} />
      </mesh>
      <Text
        position={[0, -4, 0]}
        fontSize={1}
        color={getGlowColor(THEME.primary, 1.5)}
      >
        AWAITING DATA...
      </Text>
    </group>
  )
}

function ProjectInstance({
  data,
  isDimmed,
  isHovered,
  isSelected,
  onClick,
  onHover,
  onPointerOut,
}: {
  data: ProjectNodeData
  isDimmed: boolean
  isHovered: boolean
  isSelected: boolean
  onClick: (d: ProjectNodeData) => void
  onHover: (d: ProjectNodeData) => void
  onPointerOut: () => void
}) {
  const ref = useRef<THREE.Object3D>(null)

  useFrame((state) => {
    if (ref.current && !isSelected) {
      ref.current.position.y = data.basePos.y + Math.sin(state.clock.elapsedTime * 2 + data.randomOffset) * 0.5
    }
  })

  const color = isDimmed ? data.dimColor : isHovered || isSelected ? data.brightColor : data.glowColor
  const scale = isSelected ? data.scale * 1.6 : isHovered ? data.scale * 1.3 : data.scale

  return (
    <Instance
      ref={ref as unknown as React.RefObject<THREE.Object3D>}
      position={data.basePos}
      scale={scale}
      color={color}
      onClick={(event) => {
        event.stopPropagation()
        onClick(data)
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        document.body.style.cursor = 'pointer'
        if (!isDimmed) onHover(data)
      }}
      onPointerOut={(event) => {
        event.stopPropagation()
        document.body.style.cursor = 'auto'
        onPointerOut()
      }}
    />
  )
}

function ConnectionLines({
  projects,
  isDimmed,
}: {
  projects: ProjectNodeData[]
  isDimmed: (p: ProjectNodeData) => boolean
}) {
  const { lineGeometry, lineCount } = useMemo(() => {
    const activeProjects = projects.filter((project) => !isDimmed(project))
    const points: number[] = []

    const byOperator: Record<string, ProjectNodeData[]> = {}
    const byContractor: Record<string, ProjectNodeData[]> = {}

    activeProjects.forEach((project) => {
      if (project.operator && project.operator !== 'Unknown') {
        if (!byOperator[project.operator]) byOperator[project.operator] = []
        byOperator[project.operator].push(project)
      }
      if (project.surf_contractor && project.surf_contractor !== 'Unknown') {
        if (!byContractor[project.surf_contractor]) byContractor[project.surf_contractor] = []
        byContractor[project.surf_contractor].push(project)
      }
    })

    const addLines = (groups: Record<string, ProjectNodeData[]>) => {
      Object.values(groups).forEach((group) => {
        for (let i = 0; i < group.length - 1; i++) {
          points.push(
            group[i].basePos.x,
            group[i].basePos.y,
            group[i].basePos.z,
            group[i + 1].basePos.x,
            group[i + 1].basePos.y,
            group[i + 1].basePos.z
          )
        }
      })
    }

    addLines(byOperator)
    addLines(byContractor)

    const geometry = new THREE.BufferGeometry()
    if (points.length > 0) {
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    }

    return { lineGeometry: geometry, lineCount: points.length / 6 }
  }, [projects, isDimmed])

  const materialRef = useRef<THREE.LineBasicMaterial>(null)

  useFrame((state) => {
    if (!materialRef.current) return
    materialRef.current.opacity = 0.15 + Math.sin(state.clock.elapsedTime * 3) * 0.1
  })

  useEffect(() => {
    return () => {
      lineGeometry.dispose()
    }
  }, [lineGeometry])

  if (lineCount === 0) return null

  return (
    <lineSegments geometry={lineGeometry}>
      <lineBasicMaterial
        ref={materialRef}
        color={getGlowColor(THEME.primary, 1.2)}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </lineSegments>
  )
}

function TimelineRing({ forecasts }: { forecasts: Dashboard3DProps['forecasts'] }) {
  const ringRef = useRef<THREE.Group>(null)

  useFrame((_state, delta) => {
    if (!ringRef.current) return
    ringRef.current.rotation.y += delta * 0.05
  })

  const sorted = [...forecasts].sort((a, b) => a.year - b.year)
  const maxValue = Math.max(...sorted.map((item) => item.value), 1)
  const radius = 40

  if (!sorted.length) return null

  return (
    <group ref={ringRef}>
      {sorted.map((forecast, index) => {
        const angle = (index / sorted.length) * Math.PI * 2
        const height = Math.max((forecast.value / maxValue) * 15, 0.5)
        const x = radius * Math.cos(angle)
        const z = radius * Math.sin(angle)
        const baseColor = new THREE.Color(THEME.primary).lerp(
          new THREE.Color(THEME.accent),
          forecast.value / maxValue
        )

        return (
          <TimelineBar
            key={`${forecast.year}-${forecast.metric}-${index}`}
            forecast={forecast}
            height={height}
            position={[x, height / 2, z]}
            rotation={[0, -angle, 0]}
            color={baseColor.clone().multiplyScalar(2)}
          />
        )
      })}
    </group>
  )
}

function TimelineBar({
  forecast,
  height,
  position,
  rotation,
  color,
}: {
  forecast: ForecastPoint
  height: number
  position: [number, number, number]
  rotation: [number, number, number]
  color: THREE.Color
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <group position={position} rotation={rotation}>
      <mesh
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={(event) => {
          event.stopPropagation()
          setHovered(false)
        }}
      >
        <boxGeometry args={[1.5, height, 1.5]} />
        <meshStandardMaterial color={hovered ? new THREE.Color('#ffffff') : color} toneMapped={false} />
      </mesh>

      <mesh position={[0, -height / 2 - 0.2, 0]}>
        <boxGeometry args={[2, 0.2, 2]} />
        <meshStandardMaterial color={THEME.muted} toneMapped={false} />
      </mesh>

      <Text
        position={[0, -height / 2 - 1.5, 0]}
        fontSize={1}
        color={THEME.muted}
        rotation={[0, Math.PI, 0]}
      >
        {forecast.year}
      </Text>

      {hovered && (
        <Html center position={[0, height / 2 + 2, 0]} zIndexRange={[100, 0]}>
          <div
            style={{
              background: 'rgba(10,23,20,0.95)',
              border: `1px solid ${THEME.accent}`,
              padding: '12px',
              borderRadius: '6px',
              color: '#fff',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              boxShadow: '0 0 15px rgba(201, 168, 76, 0.3)',
            }}
          >
            <strong style={{ color: THEME.accent, fontSize: '14px', display: 'block', marginBottom: '4px' }}>
              {forecast.year} Forecast
            </strong>
            <span style={{ color: THEME.muted }}>{forecast.metric}: </span>
            <span style={{ color: THEME.primary, fontWeight: 'bold' }}>
              {forecast.value.toLocaleString()} {forecast.unit}
            </span>
          </div>
        </Html>
      )}
    </group>
  )
}

function FloatingReports({
  reports,
  onSelect,
}: {
  reports: Dashboard3DProps['reports']
  onSelect: (report: Dashboard3DProps['reports'][number]) => void
}) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((_state, delta) => {
    if (!groupRef.current) return
    groupRef.current.rotation.y -= delta * 0.03
  })

  const radius = 55

  return (
    <group ref={groupRef}>
      {reports.map((report, index) => {
        const angle = (index / reports.length) * Math.PI * 2
        const x = radius * Math.cos(angle)
        const z = radius * Math.sin(angle)
        const y = 12 + Math.sin(index) * 5

        return (
          <ReportNode
            key={`${report.file_name}-${index}`}
            report={report}
            position={[x, y, z]}
            angle={angle}
            onSelect={onSelect}
          />
        )
      })}
    </group>
  )
}

function ReportNode({
  report,
  position,
  angle,
  onSelect,
}: {
  report: ReportPoint
  position: [number, number, number]
  angle: number
  onSelect: (report: ReportPoint) => void
}) {
  const [hovered, setHovered] = useState(false)
  const planeRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (!planeRef.current) return
    planeRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 1.5 + angle) * 1.5
  })

  return (
    <group ref={planeRef} position={position} rotation={[0, -angle + Math.PI / 2, 0]}>
      <mesh
        onClick={(event) => {
          event.stopPropagation()
          onSelect(report)
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={(event) => {
          event.stopPropagation()
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
      >
        <planeGeometry args={[16, 9]} />
        <meshBasicMaterial color={THEME.background} transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>

      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(16, 9)]} />
        <lineBasicMaterial
          color={hovered ? getGlowColor(THEME.primary, 3) : getGlowColor(THEME.primary, 1.2)}
          toneMapped={false}
        />
      </lineSegments>

      <Text
        position={[0, 3, 0.1]}
        fontSize={0.7}
        color={THEME.accent}
        maxWidth={14}
        anchorY="top"
        textAlign="center"
      >
        {report.file_name}
      </Text>
      <Text
        position={[0, 0, 0.1]}
        fontSize={0.4}
        color={THEME.text}
        maxWidth={14}
        anchorY="middle"
        textAlign="center"
        lineHeight={1.5}
      >
        {(report.ai_summary || '').substring(0, 150) + '...'}
      </Text>
      <Text
        position={[0, -2.5, 0.1]}
        fontSize={0.3}
        color={THEME.muted}
        anchorY="middle"
        textAlign="center"
      >
        {new Date(report.created_at).toLocaleDateString()}
      </Text>
      <Text
        position={[0, -3.5, 0.1]}
        fontSize={0.35}
        color={hovered ? THEME.text : THEME.primary}
        anchorY="bottom"
      >
        [ CLICK TO EXPAND FULL SUMMARY ]
      </Text>
    </group>
  )
}

function CameraManager({
  selectedProject,
  controlsRef,
}: {
  selectedProject: ProjectNodeData | null
  controlsRef: React.RefObject<OrbitControlsImpl | null>
}) {
  const { camera } = useThree()
  const targetPosRef = useRef<THREE.Vector3 | null>(null)
  const cameraPosRef = useRef<THREE.Vector3 | null>(null)

  useEffect(() => {
    if (selectedProject) {
      const target = selectedProject.basePos.clone()
      targetPosRef.current = target
      cameraPosRef.current = new THREE.Vector3(target.x + 10, target.y + 10, target.z + 15)
      return
    }

    targetPosRef.current = ORBIT_CENTER.clone()
    cameraPosRef.current = DEFAULT_CAMERA_POSITION.clone()
  }, [selectedProject])

  useFrame(() => {
    const targetPos = targetPosRef.current
    const cameraPos = cameraPosRef.current
    if (!targetPos || !cameraPos || !controlsRef.current) return

    camera.position.lerp(cameraPos, 0.05)
    controlsRef.current.target.lerp(targetPos, 0.05)
    controlsRef.current.update()

    if (camera.position.distanceTo(cameraPos) < 0.5 && controlsRef.current.target.distanceTo(targetPos) < 0.2) {
      targetPosRef.current = null
      cameraPosRef.current = null
    }
  })

  return null
}

function Scene({
  projects,
  forecasts,
  reports,
  searchTerm,
  selectedProject,
  setSelectedProject,
  selectedReport,
  setSelectedReport,
  isInteracting,
  setIsInteracting,
}: Dashboard3DProps & {
  searchTerm: string
  selectedProject: ProjectNodeData | null
  setSelectedProject: (project: ProjectNodeData | null) => void
  selectedReport: Dashboard3DProps['reports'][number] | null
  setSelectedReport: (report: Dashboard3DProps['reports'][number] | null) => void
  isInteracting: boolean
  setIsInteracting: (value: boolean) => void
}) {
  const [hoveredProject, setHoveredProject] = useState<ProjectNodeData | null>(null)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)

  const projectNodes = useMemo<ProjectNodeData[]>(() => {
    const maxSurf = Math.max(...projects.map((project) => project.surf_km || 0), 1)

    return projects.map((project, index) => {
      const center = CONTINENT_CENTERS[project.continent] || [0, 0, 0]
      const seedBase = `${project.development_project}|${project.country}|${project.operator}|${project.surf_km}|${index}`
      const randomA = seededValue(seedBase, 11)
      const randomB = seededValue(seedBase, 23)
      const randomC = seededValue(seedBase, 37)
      const randomD = seededValue(seedBase, 53)

      const radius = 12 * Math.cbrt(Math.max(0.0001, randomA))
      const theta = randomB * 2 * Math.PI
      const x = center[0] + radius * Math.cos(theta)
      const z = center[2] + radius * Math.sin(theta)
      const y = 1 + randomC * 8

      const scale = 0.5 + ((project.surf_km || 0) / maxSurf) * 2.5
      const colorHex = CONTINENT_COLORS[project.continent] || THEME.muted

      return {
        ...project,
        id: `proj-${index}`,
        basePos: new THREE.Vector3(x, y, z),
        scale,
        colorHex,
        glowColor: getGlowColor(colorHex, 1.5),
        brightColor: getGlowColor(colorHex, 4),
        dimColor: new THREE.Color('#081210'),
        randomOffset: randomD * Math.PI * 2,
      }
    })
  }, [projects])

  const checkDimmed = (project: ProjectNodeData) => {
    if (!searchTerm) return false
    const term = searchTerm.toLowerCase()

    return !(
      project.development_project.toLowerCase().includes(term) ||
      project.operator?.toLowerCase().includes(term) ||
      project.country?.toLowerCase().includes(term)
    )
  }

  if (!projects.length && !forecasts.length && !reports.length) {
    return <EmptyState />
  }

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={1} />

      <CameraManager selectedProject={selectedProject} controlsRef={controlsRef} />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        autoRotate={!isInteracting && !selectedProject && !selectedReport}
        autoRotateSpeed={0.5}
        enableDamping
        maxPolarAngle={Math.PI / 2 - 0.05}
        onStart={() => setIsInteracting(true)}
        onEnd={() => setIsInteracting(false)}
      />

      <EffectComposer>
        <Bloom luminanceThreshold={1} mipmapBlur intensity={1.5} />
      </EffectComposer>

      <group position={[0, -0.1, 0]}>
        <Grid
          infiniteGrid
          position={[0, 0.01, 0]}
          cellColor={THEME.primary}
          sectionColor={THEME.primary}
          cellThickness={0.5}
          sectionThickness={1}
          fadeDistance={80}
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[200, 200]} />
          <MeshReflectorMaterial
            blur={[300, 100]}
            resolution={512}
            mixBlur={1}
            mixStrength={10}
            roughness={1}
            depthScale={1.2}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#050e0c"
            metalness={0.5}
            mirror={0.5}
          />
        </mesh>
      </group>

      <Sparkles count={800} scale={120} size={1.5} color={THEME.primary} opacity={0.3} speed={0.2} />

      {projectNodes.length > 0 && (
        <Instances range={projectNodes.length} limit={Math.max(1000, projectNodes.length)}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial toneMapped={false} />
          {projectNodes.map((project) => {
            const isDimmed = checkDimmed(project)
            const isHovered = hoveredProject?.id === project.id
            const isSelected = selectedProject?.id === project.id

            return (
              <ProjectInstance
                key={project.id}
                data={project}
                isDimmed={isDimmed}
                isHovered={isHovered}
                isSelected={isSelected}
                onClick={(nextSelected) => {
                  setSelectedReport(null)
                  setSelectedProject(nextSelected)
                }}
                onHover={setHoveredProject}
                onPointerOut={() => setHoveredProject(null)}
              />
            )
          })}
        </Instances>
      )}

      <ConnectionLines projects={projectNodes} isDimmed={checkDimmed} />

      {forecasts.length > 0 && <TimelineRing forecasts={forecasts} />}
      {reports.length > 0 && (
        <FloatingReports
          reports={reports}
          onSelect={(report) => {
            setSelectedProject(null)
            setSelectedReport(report)
          }}
        />
      )}

      {hoveredProject && !selectedProject && !checkDimmed(hoveredProject) && (
        <Html position={hoveredProject.basePos} center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: 'rgba(10, 23, 20, 0.85)',
              border: `1px solid ${hoveredProject.colorHex}`,
              padding: '12px',
              borderRadius: '6px',
              color: THEME.text,
              fontFamily: 'monospace',
              width: '240px',
              backdropFilter: 'blur(4px)',
              boxShadow: `0 0 15px ${hoveredProject.colorHex}40`,
            }}
          >
            <h4
              style={{
                margin: '0 0 8px 0',
                color: hoveredProject.colorHex,
                fontSize: '14px',
                textTransform: 'uppercase',
              }}
            >
              {hoveredProject.development_project}
            </h4>
            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span>
                <span style={{ color: THEME.muted }}>Operator:</span> {hoveredProject.operator || 'Unknown'}
              </span>
              <span>
                <span style={{ color: THEME.muted }}>Country:</span> {hoveredProject.country || 'Unknown'}
              </span>
              <div style={{ height: '1px', background: '#2a3a36', margin: '4px 0' }} />
              <span style={{ color: THEME.accent }}>
                XMTs: {hoveredProject.xmt_count || 0} | SURF: {hoveredProject.surf_km || 0} km
              </span>
            </div>
          </div>
        </Html>
      )}
    </>
  )
}

// ----------------------------------------------------------------------
// MAIN WRAPPER (Handles UI Overlays)
// ----------------------------------------------------------------------

export default function Dashboard3D({
  projects = [],
  forecasts = [],
  reports = [],
  onBack,
}: Dashboard3DProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProject, setSelectedProject] = useState<ProjectNodeData | null>(null)
  const [selectedReport, setSelectedReport] = useState<Dashboard3DProps['reports'][number] | null>(null)
  const [isInteracting, setIsInteracting] = useState(false)

  const stats = useMemo(() => {
    const term = searchTerm.toLowerCase()
    const filtered = searchTerm
      ? projects.filter(
          (project) =>
            project.development_project.toLowerCase().includes(term) ||
            project.operator?.toLowerCase().includes(term) ||
            project.country?.toLowerCase().includes(term)
        )
      : projects

    return {
      total: filtered.length,
      surf: filtered.reduce((acc, project) => acc + (project.surf_km || 0), 0),
      xmts: filtered.reduce((acc, project) => acc + (project.xmt_count || 0), 0),
    }
  }, [projects, searchTerm])

  const panelStyle: CSSProperties = {
    pointerEvents: 'auto',
    background: 'rgba(10, 23, 20, 0.85)',
    backdropFilter: 'blur(10px)',
    border: `1px solid ${THEME.primary}`,
    borderRadius: '8px',
    padding: '20px',
    color: THEME.text,
    boxShadow: '0 0 20px rgba(77, 184, 158, 0.15)',
  }

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 64px)', background: THEME.background, position: 'relative' }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            zIndex: 50,
            pointerEvents: 'auto',
            background: 'rgba(10,23,20,0.85)',
            border: `1px solid ${THEME.primary}`,
            color: THEME.text,
            borderRadius: '6px',
            padding: '8px 12px',
            fontFamily: 'monospace',
            cursor: 'pointer',
          }}
        >
          ← Dashboard
        </button>
      )}

      <div style={{ ...panelStyle, position: 'absolute', top: '72px', left: '24px', width: '320px', zIndex: 40 }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', color: THEME.primary, letterSpacing: '1px' }}>
          SYSTEM SEARCH
        </h2>
        <input
          type="text"
          placeholder="Search projects or operators..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            background: 'rgba(0,0,0,0.5)',
            border: `1px solid ${THEME.muted}`,
            color: THEME.text,
            fontFamily: 'inherit',
            outline: 'none',
            borderRadius: '4px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ ...panelStyle, position: 'absolute', bottom: '24px', left: '24px', padding: '16px', minWidth: '200px', zIndex: 40 }}>
        <div style={{ fontSize: '12px', color: THEME.muted, marginBottom: '12px', letterSpacing: '1px' }}>
          CONTINENT CLUSTERS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
          {Object.entries(CONTINENT_COLORS).map(([name, color]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  background: color,
                  borderRadius: '2px',
                  boxShadow: `0 0 8px ${color}`,
                }}
              />
              <span>{name}</span>
            </div>
          ))}
        </div>
      </div>

      <Canvas
        camera={{ position: [0, 30, 80], fov: 45 }}
        onPointerMissed={() => {
          setSelectedProject(null)
          setSelectedReport(null)
        }}
      >
        <color attach="background" args={[THEME.background]} />
        <fog attach="fog" args={[THEME.background, 40, 160]} />

        <Scene
          projects={projects}
          forecasts={forecasts}
          reports={reports}
          onBack={onBack}
          searchTerm={searchTerm}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
          selectedReport={selectedReport}
          setSelectedReport={setSelectedReport}
          isInteracting={isInteracting}
          setIsInteracting={setIsInteracting}
        />

        <Html fullscreen zIndexRange={[100, 0]}>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              fontFamily: 'monospace',
            }}
          >
            <div style={{ ...panelStyle, position: 'absolute', top: '24px', right: '24px', minWidth: '220px', textAlign: 'right' }}>
              <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', color: THEME.primary, letterSpacing: '1px' }}>
                SCENE METRICS
              </h2>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: THEME.muted, marginBottom: '2px' }}>VISIBLE PROJECTS</div>
                <div style={{ fontSize: '24px', color: THEME.text }}>{stats.total.toLocaleString()}</div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', color: THEME.muted, marginBottom: '2px' }}>TOTAL SURF (KM)</div>
                <div style={{ fontSize: '24px', color: THEME.accent }}>{stats.surf.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: THEME.muted, marginBottom: '2px' }}>TOTAL XMTs</div>
                <div style={{ fontSize: '24px', color: THEME.primary }}>{stats.xmts.toLocaleString()}</div>
              </div>
            </div>

            {selectedProject && (
              <div
                style={{
                  ...panelStyle,
                  position: 'absolute',
                  top: '50%',
                  right: '24px',
                  transform: 'translateY(-50%)',
                  width: '360px',
                  borderLeft: `4px solid ${selectedProject.colorHex}`,
                  maxHeight: '80vh',
                  overflowY: 'auto',
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedProject(null)}
                  style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    background: 'none',
                    border: 'none',
                    color: THEME.muted,
                    cursor: 'pointer',
                    fontSize: '18px',
                  }}
                >
                  x
                </button>
                <h3 style={{ margin: '0 0 20px 0', color: selectedProject.colorHex, fontSize: '18px', paddingRight: '20px' }}>
                  {selectedProject.development_project}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                  <DetailRow label="Location" value={`${selectedProject.country} (${selectedProject.continent})`} />
                  <DetailRow label="Operator" value={selectedProject.operator} />
                  <DetailRow label="Contractor" value={selectedProject.surf_contractor} />
                  <DetailRow label="Facility" value={selectedProject.facility_category} />
                  <DetailRow label="Water Depth" value={selectedProject.water_depth_category} />
                  <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
                  <DetailRow label="Subsea Trees (XMT)" value={selectedProject.xmt_count} valueColor={THEME.accent} />
                  <DetailRow label="SURF Length" value={`${selectedProject.surf_km} km`} valueColor={THEME.accent} />
                  <DetailRow label="First Year" value={selectedProject.first_year} />
                  <DetailRow label="Last Year" value={selectedProject.last_year} />
                </div>
              </div>
            )}

            {selectedReport && (
              <div
                style={{
                  ...panelStyle,
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '600px',
                  maxWidth: '90vw',
                  maxHeight: '80vh',
                  overflowY: 'auto',
                  border: `1px solid ${THEME.primary}`,
                  boxShadow: `0 0 30px ${THEME.primary}40`,
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    background: 'none',
                    border: 'none',
                    color: THEME.muted,
                    cursor: 'pointer',
                    fontSize: '20px',
                  }}
                >
                  x
                </button>
                <h2 style={{ margin: '0 0 8px 0', color: THEME.accent }}>{selectedReport.file_name}</h2>
                <div style={{ fontSize: '12px', color: THEME.muted, marginBottom: '20px' }}>
                  Generated: {new Date(selectedReport.created_at).toLocaleDateString()}
                </div>

                <div style={{ color: THEME.text, fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                  {selectedReport.ai_summary}
                </div>
              </div>
            )}
          </div>
        </Html>
      </Canvas>
    </div>
  )
}

function DetailRow({
  label,
  value,
  valueColor = '#fff',
}: {
  label: string
  value: string | number | null | undefined
  valueColor?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: THEME.muted }}>{label}:</span>
      <span style={{ color: valueColor, textAlign: 'right', maxWidth: '65%' }}>{value ?? '-'}</span>
    </div>
  )
}
