import { Edges, GizmoHelper, GizmoViewport, Grid, Html, Line, OrbitControls, TransformControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Vector3 } from 'three'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import { getProfile } from '../lib/catalog'
import { eulerOf, partBox, partSize, round, snapOffset, toAxisBox, type AxisBox } from '../lib/geometry'
import { useStore } from '../lib/store'
import type { Part, Vec3 } from '../lib/types'

/** The WebGL canvas, for snapshots in the printout. */
export const canvasRef: { current: HTMLCanvasElement | null } = { current: null }

const FIT_EVENT = 'snickerei:fit'
/** Move the camera so the whole model is in view. */
export const fitView = () => window.dispatchEvent(new Event(FIT_EVENT))

const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

type Register = (id: string, g: Group | null) => void

function PartMesh({ part, selected, register }: { part: Part; selected: boolean; register: Register }) {
  const select = useStore((s) => s.select)
  const ref = useRef<Group>(null)
  useEffect(() => {
    register(part.id, ref.current)
    return () => register(part.id, null)
  }, [part.id, register])
  const prof = getProfile(part.profileId)
  const [l, t, w] = partSize(part)
  const rotation = useMemo(() => eulerOf(part.rotation), [part.rotation])
  const [hover, setHover] = useState(false)

  return (
    <group ref={ref} position={part.position} rotation={rotation}>
      <mesh
        position={[l / 2, t / 2, w / 2]}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation()
          select(part.id)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
        }}
        onPointerOut={() => setHover(false)}
      >
        <boxGeometry args={[l, t, w]} />
        <meshStandardMaterial
          color={prof.color}
          emissive={selected ? '#3b82f6' : hover && !isTouch ? '#555' : '#000'}
          emissiveIntensity={selected ? 0.35 : 0.15}
          roughness={0.8}
        />
        <Edges color={selected ? '#1d4ed8' : '#6b4f2a'} />
      </mesh>
    </group>
  )
}

/** Dimension line with a label in the middle. */
function Dim({ from, to, value }: { from: Vec3; to: Vec3; value: number }) {
  if (value <= 0) return null
  const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]
  return (
    <>
      <Line points={[from, to]} color="#1f2937" lineWidth={1.5} />
      <Html position={mid} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <span className="dim-label">{Math.round(value * 10) / 10}</span>
      </Html>
    </>
  )
}

function Dimensions({ box, offset }: { box: AxisBox; offset: number }) {
  const { min, max } = box
  const z = max[2] + offset
  return (
    <group>
      <Dim from={[min[0], min[1], z]} to={[max[0], min[1], z]} value={max[0] - min[0]} />
      <Dim from={[min[0] - offset, min[1], max[2]]} to={[min[0] - offset, max[1], max[2]]} value={max[1] - min[1]} />
      <Dim from={[max[0] + offset, min[1], min[2]]} to={[max[0] + offset, min[1], max[2]]} value={max[2] - min[2]} />
    </group>
  )
}

function unionBox(boxes: AxisBox[]): AxisBox | null {
  if (!boxes.length) return null
  return {
    min: [0, 1, 2].map((i) => Math.min(...boxes.map((b) => b.min[i]))) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...boxes.map((b) => b.max[i]))) as Vec3,
  }
}

function Scene({ lastDrag, capturing }: { lastDrag: React.MutableRefObject<number>; capturing: boolean }) {
  const parts = useStore((s) => s.project.parts)
  const selectedId = useStore((s) => s.selectedId)
  const { snap, showDimensions, snapToParts } = useStore((s) => s.settings)
  const updatePart = useStore((s) => s.updatePart)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | null

  const groups = useRef(new Map<string, Group>())
  // Bumped when parts mount/unmount so the gizmo can find a freshly added part
  const [, setVersion] = useState(0)
  const register = useCallback<Register>((id, g) => {
    if (g) groups.current.set(id, g)
    else groups.current.delete(id)
    setVersion((n) => n + 1)
  }, [])
  // drei's ref is three's TransformControls; `axis` is the handle being dragged ('X', 'XY', 'XYZ'…)
  const tc = useRef<{ axis: string | null }>(null)
  /** Position of the selected part while it's being dragged */
  const [livePos, setLivePos] = useState<Vec3 | null>(null)
  useEffect(() => setLivePos(null), [selectedId, parts])

  const selected = parts.find((p) => p.id === selectedId)
  const selectedGroup = selectedId ? groups.current.get(selectedId) : undefined
  const boxes = useMemo(() => new Map(parts.map((p) => [p.id, toAxisBox(partBox(p))])), [parts])
  const others = useMemo(() => parts.filter((p) => p.id !== selectedId).map((p) => boxes.get(p.id)!), [parts, boxes, selectedId])

  // Fit the model in view on request, and once at start-up
  useEffect(() => {
    const fit = () => {
      const box = unionBox([...boxes.values()])
      if (!box || !controls || !(camera instanceof PerspectiveCamera)) return
      const center = new Vector3(...box.min).add(new Vector3(...box.max)).multiplyScalar(0.5)
      const radius = new Vector3(...box.max).sub(new Vector3(...box.min)).length() / 2 + 150
      const vfov = (camera.fov * Math.PI) / 180
      const fov = Math.min(vfov, 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect))
      const dir = camera.position.clone().sub(controls.target).normalize()
      controls.target.copy(center)
      camera.position.copy(center).addScaledVector(dir, radius / Math.sin(fov / 2))
      controls.update()
    }
    window.addEventListener(FIT_EVENT, fit)
    return () => window.removeEventListener(FIT_EVENT, fit)
  }, [boxes, camera, controls])
  // Only a project that was already there when the app opened gets auto-fitted
  const fitOnStart = useRef(parts.length > 0)
  useEffect(() => {
    if (controls && fitOnStart.current) {
      fitOnStart.current = false
      fitView()
    }
  }, [controls])

  const onDrag = () => {
    if (!selected || !selectedGroup) return
    const pos = selectedGroup.position
    if (snapToParts) {
      const axis = tc.current?.axis ?? ''
      const box = toAxisBox(partBox({ ...selected, position: [pos.x, pos.y, pos.z] }))
      // Snap distance grows as you zoom out, so it feels the same on screen
      const dist = controls ? controls.target.distanceTo(camera.position) : 3000
      const threshold = Math.min(150, Math.max(5, dist * (isTouch ? 0.02 : 0.012)))
      const d = snapOffset(box, others, [axis.includes('X'), axis.includes('Y'), axis.includes('Z')], threshold)
      pos.set(pos.x + d[0], pos.y + d[1], pos.z + d[2])
    }
    setLivePos([pos.x, pos.y, pos.z])
  }

  const dimBox: AxisBox | null = selected
    ? livePos
      ? toAxisBox(partBox({ ...selected, position: livePos }))
      : boxes.get(selected.id)!
    : unionBox([...boxes.values()])

  return (
    <>
      <color attach="background" args={['#eef1f4']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3000, 6000, 4000]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-5000, 5000, 5000, -5000, 10, 20000]} />
      </directionalLight>

      {parts.map((p) => (
        <PartMesh key={p.id} part={p} selected={p.id === selectedId} register={register} />
      ))}

      {selectedGroup && selectedId && (
        <TransformControls
          ref={tc as never}
          object={selectedGroup}
          mode="translate"
          translationSnap={snap}
          size={isTouch ? 1.5 : 0.8}
          onObjectChange={onDrag}
          onMouseDown={() => (lastDrag.current = Infinity)}
          onMouseUp={() => {
            lastDrag.current = Date.now()
            const pos = selectedGroup.position
            updatePart(selectedId, { position: [round(pos.x), round(pos.y), round(pos.z)] })
          }}
        />
      )}

      {showDimensions && !capturing && dimBox && <Dimensions box={dimBox} offset={selected ? 60 : 120} />}

      <Grid
        args={[20000, 20000]}
        cellSize={100}
        sectionSize={1000}
        cellColor="#c9ced6"
        sectionColor="#8f98a6"
        fadeDistance={15000}
        infiniteGrid
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[40000, 40000]} />
        <shadowMaterial opacity={0.15} />
      </mesh>

      <OrbitControls makeDefault target={[500, 300, 0]} />
      {!capturing && (
        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport labelColor="white" axisHeadScale={0.9} />
        </GizmoHelper>
      )}
    </>
  )
}

export function Viewport({ capturing = false }: { capturing?: boolean }) {
  const select = useStore((s) => s.select)
  const lastDrag = useRef(0)

  return (
    <>
    <button className="fit-button icon" onClick={fitView} title="Visa hela modellen" aria-label="Visa hela modellen">
      ⤢
    </button>
    <Canvas
      shadows
      gl={{ preserveDrawingBuffer: true }}
      camera={{ position: [2500, 1800, 3000], fov: 45, near: 10, far: 100000 }}
      onCreated={({ gl }) => (canvasRef.current = gl.domElement)}
      onPointerMissed={(e) => {
        // The move gizmo isn't a raycast target, so a drag on it ends in a "missed" click
        if (e.type === 'click' && Date.now() - lastDrag.current > 200) select(null)
      }}
    >
      <Scene lastDrag={lastDrag} capturing={capturing} />
    </Canvas>
    </>
  )
}
