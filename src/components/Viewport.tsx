import { Edges, GizmoHelper, GizmoViewport, Grid, Html, Line, OrbitControls, TransformControls } from '@react-three/drei'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  ExtrudeGeometry,
  Matrix4,
  Object3D,
  PerspectiveCamera,
  RepeatWrapping,
  Shape,
  Vector2,
  Vector3,
} from 'three'
import type { Group } from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getProfile, hasGrain } from '../lib/catalog'
import { eulerOf, partBox, partSize, round, toAxisBox, type AxisBox } from '../lib/geometry'
import { cutters, type Cutter } from '../lib/cuts'
import { overlapsOf, unionBox } from '../lib/joints'
import { freeSpace, measureValue, otherBoxes, pickPoint, type FreeSpace } from '../lib/measure'
import { chooseSnaps, pointCandidates, SNAP_LABEL, snapMove, type SnapGuide } from '../lib/snap'
import { useStore, type SnapChoice } from '../lib/store'
import type { MeasurePoint, Measurement, Part, SnapKind, Vec3 } from '../lib/types'

/** The WebGL canvas, for snapshots in the printout. */
export const canvasRef: { current: HTMLCanvasElement | null } = { current: null }

const FIT_EVENT = 'snickerei:fit'
/** Move the camera so the whole model is in view. */
export const fitView = () => window.dispatchEvent(new Event(FIT_EVENT))

const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

type Register = (id: string, g: Group | null) => void

const evaluator = new Evaluator()
evaluator.attributes = ['position', 'uv', 'normal']

/** Map a cutter's 2-D outline into part-local space: (u, v) → plane axes, extruded along the third. */
const BASIS: Record<Cutter['basis'], (size: Vec3) => { m: Matrix4; depth: number }> = {
  // u = x, v = z, extruded towards -y (right-handed)
  xz: (s) => ({ m: new Matrix4().makeBasis(new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, -1, 0)).setPosition(0, s[1] + 5, 0), depth: s[1] + 10 }),
  // u = x, v = y, extruded along z
  xy: (s) => ({ m: new Matrix4().setPosition(0, 0, -5), depth: s[2] + 10 }),
  // u = y, v = z, extruded along x
  yz: (s) => ({ m: new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)).setPosition(-5, 0, 0), depth: s[0] + 10 }),
}

/** The part's geometry in local coordinates (0..L, 0..T, 0..W), with notches, angled ends and rips cut away. */
function partGeometry(part: Part, size: Vec3): BufferGeometry {
  const box = new BoxGeometry(...size).translate(size[0] / 2, size[1] / 2, size[2] / 2)
  const cuts = cutters(part)
  if (!part.notches?.length && !cuts.length) return box
  let result = new Brush(box)
  for (const n of part.notches ?? []) {
    // Grow the cutter a little past the part's faces so the cut is clean
    const min = n.min.map((v) => (v <= 0.01 ? v - 1 : v))
    const max = n.max.map((v, i) => (v >= size[i] - 0.01 ? v + 1 : v))
    const dims = [0, 1, 2].map((i) => max[i] - min[i]) as Vec3
    const cutter = new Brush(
      new BoxGeometry(...dims).translate(min[0] + dims[0] / 2, min[1] + dims[1] / 2, min[2] + dims[2] / 2),
    )
    result = evaluator.evaluate(result, cutter, SUBTRACTION)
  }
  for (const c of cuts) {
    const { m, depth } = BASIS[c.basis](size)
    const shape = new Shape(c.points.map(([u, v]) => new Vector2(u, v)))
    const geo = new ExtrudeGeometry(shape, { depth, bevelEnabled: false }).applyMatrix4(m)
    result = evaluator.evaluate(result, new Brush(geo), SUBTRACTION)
  }
  return result.geometry
}

/** Faint stripes for showing a sheet's grain; 'h' runs along u, 'v' along v. */
const stripeImages: Partial<Record<'h' | 'v', HTMLCanvasElement>> = {}
function stripeImage(dir: 'h' | 'v'): HTMLCanvasElement {
  if (!stripeImages[dir]) {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const g = c.getContext('2d')!
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, 32, 32)
    g.fillStyle = '#b8935a'
    if (dir === 'h') g.fillRect(0, 12, 32, 7)
    else g.fillRect(12, 0, 7, 32)
    stripeImages[dir] = c
  }
  return stripeImages[dir]!
}

/** Grain texture for a part, or null. On the faces u runs along the part's length. */
function useGrainTexture(part: Part, size: Vec3): CanvasTexture | null {
  const prof = getProfile(part.profileId)
  const grain = hasGrain(prof) ? part.grain : undefined
  // Keeps the stripes sharp on faces seen at a low angle
  const anisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  const texture = useMemo(() => {
    if (!grain) return null
    const t = new CanvasTexture(stripeImage(grain === 'length' ? 'h' : 'v'))
    t.wrapS = t.wrapT = RepeatWrapping
    t.anisotropy = anisotropy
    // One stripe about every 25 mm
    if (grain === 'length') t.repeat.set(1, Math.max(1, size[2] / 25))
    else t.repeat.set(Math.max(1, size[0] / 25), 1)
    return t
  }, [grain, size[0], size[2], anisotropy])
  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

function PartMesh({ part, selected, register }: { part: Part; selected: boolean; register: Register }) {
  const tapPart = useStore((s) => s.tapPart)
  const multiSelect = useStore((s) => s.multiSelect)
  const measureMode = useStore((s) => s.measureMode)
  const measureTap = useStore((s) => s.measureTap)
  const snapTypes = useStore((s) => s.settings.snapTypes)
  const setHover = useStore((s) => s.setMeasureHover)
  const camera = useThree((s) => s.camera)
  const viewSize = useThree((s) => s.size)
  const ref = useRef<Group>(null)

  /** Snap options for a pointer event on this part, best first */
  const snapOptions = (e: ThreeEvent<MouseEvent>): MeasurePoint[] => {
    if (!e.face) return []
    const n = e.face.normal.clone().transformDirection(e.object.matrixWorld)
    const base = pickPoint(e.point.toArray() as Vec3, n.toArray() as Vec3, false)
    const toScreen = (p: Vec3): [number, number] => {
      const v = new Vector3(...p).project(camera)
      return [((v.x + 1) / 2) * viewSize.width, ((1 - v.y) / 2) * viewSize.height]
    }
    const hit = e.point.toArray() as Vec3
    const options = chooseSnaps(
      pointCandidates(toAxisBox(partBox(part)), hit, base.axis),
      hit,
      toScreen,
      [e.nativeEvent.offsetX, e.nativeEvent.offsetY],
      isTouch ? 30 : 14,
      snapTypes,
    )
    return options.map((o) => ({ ...base, point: o.point.map((v) => Math.round(v * 10) / 10) as Vec3, snap: o.kind }))
  }
  useEffect(() => {
    register(part.id, ref.current)
    return () => register(part.id, null)
  }, [part.id, register])
  const prof = getProfile(part.profileId)
  const size = partSize(part)
  const key = `${size.join('x')}|${JSON.stringify([part.notches, part.ends, part.rip])}`
  const geometry = useMemo(() => partGeometry(part, size), [key])
  useEffect(() => () => geometry.dispose(), [geometry])
  const rotation = useMemo(() => eulerOf(part.rotation), [part.rotation])
  const [hovered, setHovered] = useState(false)
  const grainMap = useGrainTexture(part, size)

  return (
    <group ref={ref} position={part.position} rotation={rotation}>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation()
          if (measureMode) {
            const options = snapOptions(e)
            if (options.length) measureTap(options[0], options)
            setHover(null)
            return
          }
          const ne = e.nativeEvent
          tapPart(part.id, multiSelect || ne.shiftKey || ne.ctrlKey || ne.metaKey)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => {
          setHovered(false)
          if (measureMode) setHover(null)
        }}
        onPointerMove={(e) => {
          // Preview the snap under the mouse (touch screens have no hover)
          if (!measureMode || isTouch) return
          e.stopPropagation()
          setHover(snapOptions(e)[0] ?? null)
        }}
      >
        <meshStandardMaterial
          key={grainMap ? grainMap.uuid : 'plain'}
          map={grainMap}
          color={prof.color}
          emissive={selected ? '#3b82f6' : hovered && !isTouch && !measureMode ? '#555' : '#000'}
          emissiveIntensity={selected ? 0.35 : 0.15}
          roughness={0.8}
        />
        <Edges color={selected ? '#1d4ed8' : '#6b4f2a'} />
      </mesh>
    </group>
  )
}

/** Red see-through box where the selected part collides with another. */
function OverlapBox({ box }: { box: AxisBox }) {
  const size = [0, 1, 2].map((i) => box.max[i] - box.min[i]) as Vec3
  const centre = [0, 1, 2].map((i) => (box.min[i] + box.max[i]) / 2) as Vec3
  return (
    <mesh position={centre} renderOrder={2}>
      <boxGeometry args={size} />
      <meshBasicMaterial color="#ef4444" transparent opacity={0.45} depthTest={false} />
    </mesh>
  )
}

const fmtMm = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')

/** A saved measurement: orange line between the two surfaces, with its value. */
function MeasureLine({ m, index }: { m: Measurement; index: number }) {
  const { ends, value } = measureValue(m)
  const [p, q] = ends
  const mid: Vec3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]
  const b = m.b.point
  const offset = Math.hypot(b[0] - q[0], b[1] - q[1], b[2] - q[2]) > 1
  return (
    <group>
      <Line points={[p, q]} color="#ea580c" lineWidth={3} depthTest={false} renderOrder={3} />
      {offset && <Line points={[q, b]} color="#ea580c" lineWidth={1} dashed dashSize={20} gapSize={15} depthTest={false} />}
      <PointMarker at={m.a.point} kind={m.a.snap} />
      <PointMarker at={b} kind={m.b.snap} />
      <Html position={mid} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
        <span className="measure-label">
          <b>{index + 1}</b> {fmtMm(value)}
        </span>
      </Html>
    </group>
  )
}

/** Marker colour per snap kind, matching the chip in the view */
export const SNAP_COLOR: Record<SnapKind, string> = {
  vertex: '#7c3aed',
  edgeMid: '#0891b2',
  edge: '#0891b2',
  faceCenter: '#16a34a',
  center: '#db2777',
  face: '#ea580c',
}

function PointMarker({ at, kind, size = 9, ghost = false }: { at: Vec3; kind?: SnapKind; size?: number; ghost?: boolean }) {
  return (
    <mesh position={at} renderOrder={4}>
      <sphereGeometry args={[size, 16, 12]} />
      <meshBasicMaterial color={SNAP_COLOR[kind ?? 'face']} depthTest={false} transparent opacity={ghost ? 0.6 : 0.95} />
    </mesh>
  )
}

/** Free space from the selection to the nearest part or the floor, as green dashed lines. */
function FreeSpaceLines({ spaces }: { spaces: FreeSpace[] }) {
  return (
    <>
      {spaces.map((f) => {
        const mid: Vec3 = [(f.from[0] + f.end[0]) / 2, (f.from[1] + f.end[1]) / 2, (f.from[2] + f.end[2]) / 2]
        return (
          <group key={f.direction}>
            <Line points={[f.from, f.end]} color="#16a34a" lineWidth={2} dashed dashSize={25} gapSize={15} />
            <Html position={mid} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
              <span className="free-label">{fmtMm(f.gap)}</span>
            </Html>
          </group>
        )
      })}
    </>
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

function Scene({ lastDrag, capturing }: { lastDrag: React.MutableRefObject<number>; capturing: boolean }) {
  const parts = useStore((s) => s.project.parts)
  const selection = useStore((s) => s.selection)
  const { snap, showDimensions, snapToParts } = useStore((s) => s.settings)
  const moveSelection = useStore((s) => s.moveSelection)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | null

  const groups = useRef(new Map<string, Group>())
  const register = useCallback<Register>((id, g) => {
    if (g) groups.current.set(id, g)
    else groups.current.delete(id)
  }, [])
  // drei's ref is three's TransformControls; `axis` is the handle being dragged ('X', 'XY', 'XYZ'…)
  const tc = useRef<{ axis: string | null }>(null)

  const selected = useMemo(() => {
    const ids = new Set(selection)
    return parts.filter((p) => ids.has(p.id))
  }, [parts, selection])
  const boxes = useMemo(() => new Map(parts.map((p) => [p.id, toAxisBox(partBox(p))])), [parts])
  const selBox = useMemo(() => unionBox(selected), [selected])
  const others = useMemo(() => {
    const ids = new Set(selection)
    return parts.filter((p) => !ids.has(p.id)).map((p) => boxes.get(p.id)!)
  }, [parts, boxes, selection])
  const overlaps = useMemo(
    () => (selected.length === 1 ? overlapsOf(selected[0], parts).map((o) => o.box) : []),
    [selected, parts],
  )
  const measureMode = useStore((s) => s.measureMode)
  const measureTap = useStore((s) => s.measureTap)
  const pendingPoint = useStore((s) => s.pendingPoint)
  const measureHover = useStore((s) => s.measureHover)
  const snapTypes = useStore((s) => s.settings.snapTypes)
  /** What snapped while dragging, drawn as guide lines */
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const measurements = useStore((s) => s.project.measurements)
  const spaces = useMemo(
    () => (selBox ? freeSpace(selBox, otherBoxes(parts, new Set(selection))).filter((f) => f.gap <= 3000) : []),
    [selBox, parts, selection],
  )

  // The gizmo moves this invisible pivot (at the selection's min corner); the
  // parts follow it while dragging and are committed on release.
  const pivot = useMemo(() => new Object3D(), [])
  const [delta, setDelta] = useState<Vec3 | null>(null)
  useEffect(() => {
    if (selBox) pivot.position.set(...selBox.min)
    setDelta(null)
  }, [selBox, pivot])

  // Fit the model in view on request, and once at start-up
  useEffect(() => {
    const fit = () => {
      const box = unionBox(parts)
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
  }, [parts, camera, controls])
  // Only a project that was already there when the app opened gets auto-fitted
  const fitOnStart = useRef(parts.length > 0)
  useEffect(() => {
    if (controls && fitOnStart.current) {
      fitOnStart.current = false
      fitView()
    }
  }, [controls])

  const onDrag = () => {
    if (!selBox) return
    const pos = pivot.position
    if (snapToParts) {
      const axis = tc.current?.axis ?? ''
      const d0 = [pos.x - selBox.min[0], pos.y - selBox.min[1], pos.z - selBox.min[2]]
      const moved: AxisBox = {
        min: [0, 1, 2].map((i) => selBox.min[i] + d0[i]) as Vec3,
        max: [0, 1, 2].map((i) => selBox.max[i] + d0[i]) as Vec3,
      }
      // Snap distance grows as you zoom out, so it feels the same on screen
      const dist = controls ? controls.target.distanceTo(camera.position) : 3000
      const threshold = Math.min(150, Math.max(5, dist * (isTouch ? 0.02 : 0.012)))
      const { offset: s, guides: g } = snapMove(
        moved,
        others,
        [axis.includes('X'), axis.includes('Y'), axis.includes('Z')],
        threshold,
        snapTypes,
      )
      pos.set(pos.x + s[0], pos.y + s[1], pos.z + s[2])
      setGuides(g)
    }
    const d: Vec3 = [pos.x - selBox.min[0], pos.y - selBox.min[1], pos.z - selBox.min[2]]
    for (const p of selected) groups.current.get(p.id)?.position.set(p.position[0] + d[0], p.position[1] + d[1], p.position[2] + d[2])
    setDelta(d)
  }

  const dimBox: AxisBox | null = selBox
    ? delta
      ? { min: [0, 1, 2].map((i) => selBox.min[i] + delta[i]) as Vec3, max: [0, 1, 2].map((i) => selBox.max[i] + delta[i]) as Vec3 }
      : selBox
    : unionBox(parts)

  return (
    <>
      <color attach="background" args={['#eef1f4']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3000, 6000, 4000]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-5000, 5000, 5000, -5000, 10, 20000]} />
      </directionalLight>

      {parts.map((p) => (
        <PartMesh key={p.id} part={p} selected={selection.includes(p.id)} register={register} />
      ))}
      {!capturing && !delta && overlaps.map((b, i) => <OverlapBox key={i} box={b} />)}

      <primitive object={pivot} />
      {selBox && (
        <TransformControls
          ref={tc as never}
          object={pivot}
          mode="translate"
          translationSnap={snap}
          size={isTouch ? 1.5 : 0.8}
          onObjectChange={onDrag}
          onMouseDown={() => (lastDrag.current = Infinity)}
          onMouseUp={() => {
            lastDrag.current = Date.now()
            setGuides([])
            const d = [0, 1, 2].map((i) => round(pivot.position.getComponent(i) - selBox.min[i])) as Vec3
            if (d.some((v) => v !== 0)) moveSelection(d)
            else setDelta(null)
          }}
        />
      )}

      {showDimensions && !capturing && dimBox && <Dimensions box={dimBox} offset={selBox ? 60 : 120} />}
      {showDimensions && !capturing && !delta && <FreeSpaceLines spaces={spaces} />}
      {!capturing && measurements.map((m, i) => <MeasureLine key={m.id} m={m} index={i} />)}
      {!capturing && pendingPoint && <PointMarker at={pendingPoint.point} kind={pendingPoint.snap} size={14} />}
      {!capturing && measureHover && <PointMarker at={measureHover.point} kind={measureHover.snap} size={12} ghost />}
      {!capturing && guides.map((g, i) => (
        <Line key={i} points={[g.from, g.to]} color={g.kind === 'center' ? '#db2777' : '#0891b2'} lineWidth={2} dashed dashSize={20} gapSize={12} depthTest={false} />
      ))}

      <Grid
        args={[20000, 20000]}
        cellSize={100}
        sectionSize={1000}
        cellColor="#c9ced6"
        sectionColor="#8f98a6"
        fadeDistance={15000}
        infiniteGrid
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.5, 0]}
        receiveShadow
        // Only a click target while measuring, so a tap on empty floor still deselects otherwise
        onClick={
          measureMode
            ? (e) => {
                e.stopPropagation()
                measureTap(pickPoint([e.point.x, 0, e.point.z], [0, 1, 0], true))
              }
            : undefined
        }
      >
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

/** What the last tap snapped to; tap to try the next alternative. */
function SnapChip({ choice, onCycle }: { choice: SnapChoice; onCycle: () => void }) {
  const current = choice.options[choice.index]
  const kind = current.snap ?? 'face'
  const more = choice.options.length > 1
  const label = current.floor ? 'Golvet' : SNAP_LABEL[kind]
  return (
    <button
      className="snap-chip"
      onClick={onCycle}
      disabled={!more}
      title={more ? 'Byt till nästa fästpunkt' : undefined}
      style={{ borderColor: SNAP_COLOR[kind] }}
    >
      <span className="snap-dot" style={{ background: SNAP_COLOR[kind] }} />
      {label}
      {more && (
        <span className="muted small">
          {' '}
          {choice.index + 1}/{choice.options.length} ⟳
        </span>
      )}
    </button>
  )
}

export function Viewport({ capturing = false }: { capturing?: boolean }) {
  const clearSelection = useStore((s) => s.clearSelection)
  const multiSelect = useStore((s) => s.multiSelect)
  const setMultiSelect = useStore((s) => s.setMultiSelect)
  const measureMode = useStore((s) => s.measureMode)
  const setMeasureMode = useStore((s) => s.setMeasureMode)
  const pending = useStore((s) => s.pendingPoint !== null)
  const snapChoice = useStore((s) => s.snapChoice)
  const cycleSnap = useStore((s) => s.cycleSnap)
  const count = useStore((s) => s.selection.length)
  const lastDrag = useRef(0)

  return (
    <>
    <div className="view-buttons">
      <button className="icon" onClick={fitView} title="Visa hela modellen" aria-label="Visa hela modellen">
        ⤢
      </button>
      <button
        className={`multi-toggle ${multiSelect ? 'on' : ''}`}
        aria-pressed={multiSelect}
        onClick={() => setMultiSelect(!multiSelect)}
        title="Tryck på delar för att markera flera"
      >
        {multiSelect ? '☑' : '☐'} Flera{count > 1 ? ` (${count})` : ''}
      </button>
      <button
        className={`multi-toggle ${measureMode ? 'on measure' : ''}`}
        aria-pressed={measureMode}
        onClick={() => setMeasureMode(!measureMode)}
        title="Mät: tryck på två ytor eller golvet"
      >
        📏 Mät
      </button>
    </div>
    {measureMode && (
      <div className="measure-top">
        <div className="measure-hint" role="status">
          {pending ? 'Tryck på den andra ytan (eller golvet)' : 'Tryck på en yta eller golvet'}
        </div>
        {snapChoice && <SnapChip choice={snapChoice} onCycle={cycleSnap} />}
      </div>
    )}
    <Canvas
      shadows
      gl={{ preserveDrawingBuffer: true }}
      camera={{ position: [2500, 1800, 3000], fov: 45, near: 10, far: 100000 }}
      onCreated={({ gl }) => (canvasRef.current = gl.domElement)}
      onPointerMissed={(e) => {
        // The move gizmo isn't a raycast target, so a drag on it ends in a "missed" click
        if (e.type === 'click' && Date.now() - lastDrag.current > 200 && !useStore.getState().measureMode) clearSelection()
      }}
    >
      <Scene lastDrag={lastDrag} capturing={capturing} />
    </Canvas>
    </>
  )
}
