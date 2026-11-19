import { Edges, GizmoHelper, GizmoViewport, Html, Line, OrbitControls, TransformControls } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  type Intersection,
  type Mesh,
  ExtrudeGeometry,
  type Material,
  Matrix4,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  RepeatWrapping,
  Shape,
  Vector2,
  Vector3,
} from 'three'
import type { Group } from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getProfile, hasGrain, PROFILES, shortName } from '../lib/catalog'
import { eulerOf, partBox, partSize, round, toAxisBox, type AxisBox } from '../lib/geometry'
import { cutters, type Cutter } from '../lib/cuts'
import { AXIS_BOARDS, switchButtJoints } from '../lib/corner'
import { endName, endPoint } from '../lib/ends'
import { reorientOptions } from '../lib/place'
import { isLyingSheet, joistSpacing } from '../lib/frame'
import { freeSizeAlong } from '../lib/resize'
import { analyse, STATUS_COLOR } from '../lib/strength'
import { overlapsOf, unionBox } from '../lib/joints'
import { moveToGap } from '../lib/move'
import { freeSpace, measureValue, otherBoxes, pickPoint, type FreeSpace } from '../lib/measure'
import { chooseSnaps, pointCandidates, SNAP_LABEL, snapMove, type SnapGuide } from '../lib/snap'
import { useStore, type SnapChoice } from '../lib/store'
import { NumberField } from './NumberField'
import type { MeasurePoint, Measurement, Part, SnapKind, Vec3 } from '../lib/types'

/**
 * Takes a picture of the 3D view for the printout. The view is only drawn on
 * demand, so this draws a frame and reads it straight away.
 */
export const snapshotRef: { current: (() => string) | null } = { current: null }

export interface FuzzyHit {
  partId: string
  hit: Vec3
  normal: Vec3
  /** The tap itself missed; a ray beside it found the part */
  missed: boolean
}
/**
 * Finds the board nearest a tap that just missed: casts rays in widening
 * circles around the tap point (in screen pixels) and returns the first part
 * hit. Set by the scene; used when placing boards.
 */
const fuzzyPickRef: { current: ((clientX: number, clientY: number, maxPx: number) => FuzzyHit | null) | null } = {
  current: null,
}


const FIT_EVENT = 'snickerei:fit'
/** Move the camera so the whole model is in view. */
export const fitView = () => window.dispatchEvent(new Event(FIT_EVENT))

const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
/** How far (screen px) from a board a tap still counts as a tap on it */
const FUZZY_PX = isTouch ? 36 : 16

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

function PartMesh({ part, selected, register, tint }: { part: Part; selected: boolean; register: Register; tint?: string }) {
  const pickPart = useStore((s) => s.pickPart)
  const moving = useStore((s) => s.moveMode)
  const moveTap = useStore((s) => s.moveTap)
  const measureMode = useStore((s) => s.measureMode)
  const measureTap = useStore((s) => s.measureTap)
  const placing = useStore((s) => s.placeProfile !== null)
  const placeTap = useStore((s) => s.placeTap)
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
        userData={{ partId: part.id }}
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation()
          if (placing) {
            if (!e.face) return
            const n = e.face.normal.clone().transformDirection(e.object.matrixWorld)
            // Sheets go corner to corner: snap the tap to the board's corners and edges
            const armed = useStore.getState().placeProfile
            const snap = armed && getProfile(armed).kind === 'sheet' ? snapOptions(e)[0] : undefined
            placeTap({
              partId: part.id,
              hit: snap ? snap.point : (e.point.toArray() as Vec3),
              normal: n.toArray() as Vec3,
              snapped: !!snap && snap.snap !== 'face',
            })
            return
          }
          if (measureMode) {
            const options = snapOptions(e)
            if (options.length) measureTap(options[0], options)
            setHover(null)
            return
          }
          if (moving) {
            if (!e.face) return
            const n = e.face.normal.clone().transformDirection(e.object.matrixWorld)
            moveTap({ partId: part.id, hit: e.point.toArray() as Vec3, normal: n.toArray() as Vec3 })
            return
          }
          const ne = e.nativeEvent
          pickPart(part.id, ne.shiftKey || ne.ctrlKey || ne.metaKey)
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
          key={grainMap && !tint ? grainMap.uuid : tint ?? 'plain'}
          map={tint ? null : grainMap}
          color={tint ?? prof.color}
          emissive={selected ? '#3b82f6' : hovered && !isTouch && !measureMode ? '#555' : '#000'}
          emissiveIntensity={selected ? 0.35 : 0.15}
          roughness={0.8}
        />
        <Edges color={selected ? '#1d4ed8' : '#6b4f2a'} />
      </mesh>
    </group>
  )
}

/** Remove the gizmo's two-axis plane handles: they're the easiest to grab by mistake. */
function stripPlaneHandles(controls: unknown) {
  const g = (controls as { gizmo?: { gizmo?: Record<string, Object3D>; picker?: Record<string, Object3D> } }).gizmo
  for (const group of [g?.gizmo?.translate, g?.picker?.translate]) {
    if (!group) continue
    for (const child of [...group.children]) if (['XY', 'YZ', 'XZ', 'XYZ'].includes(child.name)) group.remove(child)
  }
}

const AXIS_COLOR = ['#dc2626', '#16a34a', '#2563eb']

/**
 * Six arrows on the sides of the selection, part of the 3D scene. A tap
 * moves the selection one step that way. They keep the same size on screen
 * at any zoom, and have large invisible tap zones for a thumb.
 */
function MoveArrows({ box }: { box: AxisBox }) {
  const moveSelection = useStore((s) => s.moveSelection)
  const step = useStore((s) => s.settings.moveStep)
  const camera = useThree((s) => s.camera)
  const centre = [0, 1, 2].map((i) => (box.min[i] + box.max[i]) / 2) as Vec3
  const groups = useRef<(Group | null)[]>([])
  // Constant on-screen size: scale with the distance to the camera every frame
  useFrame(() => {
    for (const g of groups.current) {
      if (!g) continue
      const d = camera.position.distanceTo(g.position)
      g.scale.setScalar(d * (isTouch ? 0.0011 : 0.0008))
    }
  })
  const arrows: { axis: 0 | 1 | 2; sign: 1 | -1 }[] = []
  for (const axis of [0, 1, 2] as const) for (const sign of [1, -1] as const) arrows.push({ axis, sign })

  return (
    <>
      {arrows.map(({ axis, sign }, i) => {
        const pos = [...centre] as Vec3
        pos[axis] = sign > 0 ? box.max[axis] : box.min[axis]
        // Point the arrow (modelled along +y) out of the face
        const rot: Vec3 = axis === 0 ? [0, 0, -sign * Math.PI / 2] : axis === 2 ? [sign * Math.PI / 2, 0, 0] : [sign > 0 ? 0 : Math.PI, 0, 0]
        const go = (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          const d: Vec3 = [0, 0, 0]
          d[axis] = sign * step
          moveSelection(d)
        }
        return (
          <group key={i} position={pos} ref={(g) => (groups.current[i] = g)}>
            <group rotation={rot}>
              {/* Shaft and head, offset a little out from the face */}
              <mesh position={[0, 22, 0]} renderOrder={5}>
                <cylinderGeometry args={[3, 3, 24, 12]} />
                <meshBasicMaterial color={AXIS_COLOR[axis]} depthTest={false} transparent opacity={0.9} />
              </mesh>
              <mesh position={[0, 40, 0]} renderOrder={5}>
                <coneGeometry args={[9, 16, 16]} />
                <meshBasicMaterial color={AXIS_COLOR[axis]} depthTest={false} transparent opacity={0.95} />
              </mesh>
              {/* Large invisible tap zone */}
              <mesh position={[0, 30, 0]} onClick={go}>
                <cylinderGeometry args={[20, 20, 44, 8]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
          </group>
        )
      })}
    </>
  )
}

/**
 * Three rings around the selection, one per axis (same colours as the move
 * arrows), each with two arrow handles: tap one to turn the selection 90°
 * that way. Constant size on screen; large invisible tap zones.
 */
function RotateRings({ box }: { box: AxisBox }) {
  const rotateStep = useStore((s) => s.rotateSelectionStep)
  const camera = useThree((s) => s.camera)
  const centre = [0, 1, 2].map((i) => (box.min[i] + box.max[i]) / 2) as Vec3
  const ref = useRef<Group>(null)
  useFrame(() => {
    const g = ref.current
    if (g) g.scale.setScalar(camera.position.distanceTo(g.position) * (isTouch ? 0.0011 : 0.0008))
  })
  const R = 60
  // Ring around local z; these turn local z onto each world axis
  const ringRot: Record<0 | 1 | 2, Vec3> = { 0: [0, Math.PI / 2, 0], 1: [-Math.PI / 2, 0, 0], 2: [0, 0, 0] }
  // Where each axis's handles sit on its ring, spread out so they don't overlap
  const handleAt: Record<0 | 1 | 2, number> = { 0: Math.PI / 2, 1: Math.PI / 4, 2: 0 }
  const ARC = (55 * Math.PI) / 180
  return (
    <group ref={ref} position={centre}>
      {([0, 1, 2] as const).map((axis) => (
        <group key={axis} rotation={ringRot[axis]}>
          {/* Thin full ring */}
          <mesh renderOrder={5}>
            <torusGeometry args={[R, 0.8, 6, 64]} />
            <meshBasicMaterial color={AXIS_COLOR[axis]} depthTest={false} transparent opacity={0.5} />
          </mesh>
          {/* Two handles opposite each other: one turns forward, one back */}
          {([1, -1] as const).map((dir) => {
            const start = handleAt[axis] + (dir > 0 ? 0 : Math.PI)
            const head = dir > 0 ? start + ARC : start
            const headRot = dir > 0 ? head : head + Math.PI
            const go = (e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              rotateStep(axis, dir)
            }
            return (
              <group key={dir}>
                <mesh rotation={[0, 0, start]} renderOrder={6}>
                  <torusGeometry args={[R, 3, 8, 24, ARC]} />
                  <meshBasicMaterial color={AXIS_COLOR[axis]} depthTest={false} transparent opacity={0.95} />
                </mesh>
                <mesh position={[R * Math.cos(head), R * Math.sin(head), 0]} rotation={[0, 0, headRot]} renderOrder={6}>
                  <coneGeometry args={[8, 15, 16]} />
                  <meshBasicMaterial color={AXIS_COLOR[axis]} depthTest={false} transparent opacity={0.95} />
                </mesh>
                {/* Large invisible tap zone along the handle */}
                <mesh rotation={[0, 0, start - 0.1]} onClick={go}>
                  <torusGeometry args={[R, 16, 8, 16, ARC + 0.2]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              </group>
            )
          })}
        </group>
      ))}
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

/**
 * Free space from the selection to the nearest part or the floor, as green
 * dashed lines. Tapping a number lets you type the gap you want; the
 * selection moves to make it so.
 */
function FreeSpaceLines({ spaces }: { spaces: FreeSpace[] }) {
  const moveSelection = useStore((s) => s.moveSelection)
  const [editing, setEditing] = useState<FreeSpace['direction'] | null>(null)
  return (
    <>
      {spaces.map((f) => {
        const mid: Vec3 = [(f.from[0] + f.end[0]) / 2, (f.from[1] + f.end[1]) / 2, (f.from[2] + f.end[2]) / 2]
        const open = editing === f.direction
        return (
          <group key={f.direction}>
            <Line points={[f.from, f.end]} color="#16a34a" lineWidth={2} dashed dashSize={25} gapSize={15} />
            <Html position={mid} center zIndexRange={open ? [20, 10] : [5, 0]}>
              {open ? (
                <LabelInput
                  value={f.gap}
                  label={`Fritt ${f.direction} till ${f.to} (mm)`}
                  onDone={(gap) => {
                    setEditing(null)
                    if (gap === null) return
                    const d = moveToGap(f, gap)
                    if (d.some((v) => v !== 0)) moveSelection(d)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="free-label editable"
                  title={`Fritt ${f.direction} till ${f.to} — tryck för att ändra`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditing(f.direction)
                  }}
                >
                  {fmtMm(f.gap)}
                </button>
              )}
            </Html>
          </group>
        )
      })}
    </>
  )
}

/** Typing field for a number label in the view; commits on Enter or blur, Esc cancels. */
function LabelInput({ value, label, min = 0, onDone }: { value: number; label: string; min?: number; onDone: (v: number | null) => void }) {
  const [text, setText] = useState(fmtMm(value))
  const done = useRef(false)
  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    const v = Number(text.replace(',', '.'))
    onDone(commit && Number.isFinite(v) && v >= min && v !== value ? v : null)
  }
  return (
    <form
      className="gap-edit"
      onSubmit={(e) => {
        e.preventDefault()
        finish(true)
      }}
    >
      <input
        autoFocus
        inputMode="decimal"
        enterKeyHint="done"
        aria-label={label}
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => e.key === 'Escape' && finish(false)}
      />
      <span>mm</span>
    </form>
  )
}

/** The selected board's ends, named as in the Ändar menu ("Övre", "Vänstra" …). */
function EndLabels({ partId }: { partId: string }) {
  const part = useStore((s) => s.project.parts.find((p) => p.id === partId))
  if (!part || getProfile(part.profileId).kind === 'sheet') return null
  return (
    <>
      {([0, 1] as const).map((i) => (
        <Html key={i} position={endPoint(part, i)} center zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}>
          <span className="end-label-3d">{endName(part, i)}</span>
        </Html>
      ))}
    </>
  )
}

const AXIS_NAME = ['Bredd', 'Höjd', 'Djup']

/** Dimension line with a label in the middle; tap the label to type a new size when it can change. */
function Dim({ from, to, value, label, onCommit }: { from: Vec3; to: Vec3; value: number; label: string; onCommit?: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  if (value <= 0) return null
  const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]
  return (
    <>
      <Line points={[from, to]} color="#1f2937" lineWidth={1.5} />
      <Html position={mid} center zIndexRange={editing ? [20, 10] : [5, 0]} style={{ pointerEvents: onCommit ? 'auto' : 'none' }}>
        {editing && onCommit ? (
          <LabelInput
            value={Math.round(value * 10) / 10}
            label={`${label} (mm)`}
            min={1}
            onDone={(v) => {
              setEditing(false)
              if (v !== null) onCommit(v)
            }}
          />
        ) : onCommit ? (
          <button
            type="button"
            className="dim-label editable"
            title={`${label} — tryck för att ändra`}
            onClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
          >
            {fmtMm(value)}
          </button>
        ) : (
          <span className="dim-label">{fmtMm(value)}</span>
        )}
      </Html>
    </>
  )
}

/**
 * Size labels: one board shows only its length, a sheet its length and
 * width; several parts (a group, or the whole build) show the outer width,
 * height and depth. All editable: a board/sheet changes size, several parts
 * stretch (`stretchParts`).
 */
function Dimensions({ box, offset, axes, label }: { box: AxisBox; offset: number; axes: (0 | 1 | 2)[] | null; label?: (axis: 0 | 1 | 2) => string }) {
  const resize = useStore((s) => s.resizeSelection)
  const { min, max } = box
  const z = max[2] + offset
  const show = (a: 0 | 1 | 2) => !axes || axes.includes(a)
  const name = (a: 0 | 1 | 2) => label?.(a) ?? AXIS_NAME[a]
  return (
    <group>
      {show(0) && (
        <Dim from={[min[0], min[1], z]} to={[max[0], min[1], z]} value={max[0] - min[0]} label={name(0)} onCommit={(v) => resize(0, v)} />
      )}
      {show(1) && (
        <Dim
          from={[min[0] - offset, min[1], max[2]]}
          to={[min[0] - offset, max[1], max[2]]}
          value={max[1] - min[1]}
          label={name(1)}
          onCommit={(v) => resize(1, v)}
        />
      )}
      {show(2) && (
        <Dim
          from={[max[0] + offset, min[1], min[2]]}
          to={[max[0] + offset, min[1], max[2]]}
          value={max[2] - min[2]}
          label={name(2)}
          onCommit={(v) => resize(2, v)}
        />
      )}
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
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const raycaster = new Raycaster()
    fuzzyPickRef.current = (clientX, clientY, maxPx) => {
      const rect = gl.domElement.getBoundingClientRect()
      const meshes: Object3D[] = []
      scene.traverse((o) => {
        if (o.userData.partId && (o as Mesh).isMesh) meshes.push(o)
      })
      if (!meshes.length) return null
      for (const r of [0, 6, 12, 18, 24, 30, 36, 42].filter((x) => x <= maxPx)) {
        const steps = r === 0 ? 1 : 12
        let best: Intersection | null = null
        for (let k = 0; k < steps; k++) {
          const a = (k / steps) * Math.PI * 2
          const x = clientX + r * Math.cos(a) - rect.left
          const y = clientY + r * Math.sin(a) - rect.top
          raycaster.setFromCamera(new Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1), camera)
          const hit = raycaster.intersectObjects(meshes, false)[0]
          if (hit && (!best || hit.distance < best.distance)) best = hit
        }
        if (best?.face) {
          const n = best.face.normal.clone().transformDirection(best.object.matrixWorld)
          return {
            partId: best.object.userData.partId,
            hit: best.point.toArray() as Vec3,
            normal: n.toArray() as Vec3,
            missed: r > 0,
          }
        }
      }
      return null
    }
    return () => {
      fuzzyPickRef.current = null
    }
  }, [gl, scene, camera])
  useEffect(() => {
    snapshotRef.current = () => {
      gl.render(scene, camera)
      return gl.domElement.toDataURL('image/png')
    }
  }, [gl, scene, camera])

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
  const placing = useStore((s) => s.placeProfile !== null)
  const placeTap = useStore((s) => s.placeTap)
  const moveMode = useStore((s) => s.moveMode)
  const moveTap = useStore((s) => s.moveTap)
  const rotateMode = useStore((s) => s.rotateMode)
  const { freeMove, mode } = useStore((s) => s.settings)
  const pendingPoint = useStore((s) => s.pendingPoint)
  const sheetCorner = useStore((s) => s.sheetCorner)
  const measureHover = useStore((s) => s.measureHover)
  const snapTypes = useStore((s) => s.settings.snapTypes)
  /** What snapped while dragging, drawn as guide lines */
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const measurements = useStore((s) => s.project.measurements)
  // Analys → "Visa i 3D": colour horizontal parts by how they hold up
  const analysisView = useStore((s) => s.analysisView)
  const purpose = useStore((s) => s.project.purpose ?? 'forvaring')
  const tints = useMemo(() => {
    if (!analysisView) return null
    const a = analyse(parts, purpose)
    const m = new Map<string, string>(parts.map((p) => [p.id, '#d6d3d1']))
    for (const b of a.beams) m.set(b.partId, STATUS_COLOR[b.status])
    for (const p of a.posts) m.set(p.partId, STATUS_COLOR[p.status])
    for (const id of a.floating) m.set(id, STATUS_COLOR.bad)
    return m
  }, [analysisView, parts, purpose])
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
      // On phones the toolbar and panel float over the view: fit the model
      // into the visible gap between them, not behind them
      const canvas = gl.domElement.getBoundingClientRect()
      const covered = (sel: string, edge: 'top' | 'bottom') => {
        const el = document.querySelector(sel)
        if (!el) return 0
        const r = el.getBoundingClientRect()
        return edge === 'top' ? Math.max(0, r.bottom - canvas.top) : Math.max(0, canvas.bottom - r.top)
      }
      const h = canvas.height || 1
      const topInset = Math.min(covered('.app.mobile .toolbar', 'top'), h * 0.3)
      const bottomInset = Math.min(covered('.app.mobile .sheet', 'bottom'), h * 0.6)
      const visibleFrac = Math.max(0.2, (h - topInset - bottomInset) / h)

      const center = new Vector3(...box.min).add(new Vector3(...box.max)).multiplyScalar(0.5)
      const radius = new Vector3(...box.max).sub(new Vector3(...box.min)).length() / 2 + 150
      const vfov = (camera.fov * Math.PI) / 180
      const visibleVfov = 2 * Math.atan(Math.tan(vfov / 2) * visibleFrac)
      const fov = Math.min(visibleVfov, 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect))
      const dir = camera.position.clone().sub(controls.target).normalize()
      const dist = radius / Math.sin(fov / 2)
      controls.target.copy(center)
      camera.position.copy(center).addScaledVector(dir, dist)
      controls.update()
      // Shift the view so the model's centre lands in the middle of the gap
      const shiftPx = (bottomInset - topInset) / 2
      if (Math.abs(shiftPx) > 1) {
        const worldPerPx = (2 * dist * Math.tan(vfov / 2)) / h
        const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
        const shift = up.multiplyScalar(-shiftPx * worldPerPx)
        camera.position.add(shift)
        controls.target.add(shift)
        controls.update()
      }
    }
    window.addEventListener(FIT_EVENT, fit)
    return () => window.removeEventListener(FIT_EVENT, fit)
  }, [parts, camera, controls, gl])
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
  // One board: only its length; one sheet: length and width; else all three
  const single = selection.length === 1 ? parts.find((p) => p.id === selection[0]) : undefined
  const dimAxes: (0 | 1 | 2)[] | null = single
    ? ([0, 1, 2] as const).filter((a) => freeSizeAlong(single, a) !== null)
    : null
  const dimLabel = single ? (a: 0 | 1 | 2) => (freeSizeAlong(single, a) === 'width' ? 'Bredd' : 'Längd') : undefined

  return (
    <>
      <color attach="background" args={['#eef1f4']} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[3000, 6000, 4000]}
        intensity={1.6}
        castShadow
        // Smaller shadow map on phones: much cheaper, hardly visible
        shadow-mapSize={isTouch ? [1024, 1024] : [2048, 2048]}
      >
        <orthographicCamera attach="shadow-camera" args={[-5000, 5000, 5000, -5000, 10, 20000]} />
      </directionalLight>

      {parts.map((p) => (
        <PartMesh key={p.id} part={p} selected={selection.includes(p.id)} register={register} tint={tints?.get(p.id)} />
      ))}
      {!capturing && !delta && overlaps.map((b, i) => <OverlapBox key={i} box={b} />)}

      <primitive object={pivot} />
      {/* The free 3D drag gizmo is an advanced option (off by default), only in
          Bygg mode and never while placing, measuring or using the move arrows */}
      {selBox && freeMove && mode === 'bygg' && !placing && !moveMode && !rotateMode && !measureMode && (
        <TransformControls
          ref={(c: unknown) => {
            ;(tc as React.MutableRefObject<unknown>).current = c
            if (c) stripPlaneHandles(c)
          }}
          object={pivot}
          mode="translate"
          translationSnap={snap}
          size={isTouch ? 0.75 : 0.6}
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

      {moveMode && selBox && !capturing && <MoveArrows box={selBox} />}
      {rotateMode && selBox && !capturing && <RotateRings box={selBox} />}
      {showDimensions && !capturing && dimBox && (
        <Dimensions box={dimBox} offset={selBox ? 60 : 120} axes={dimAxes} label={dimLabel} />
      )}
      {showDimensions && !capturing && !delta && <FreeSpaceLines spaces={spaces} />}
      {!capturing && mode === 'redigera' && selection.length === 1 && <EndLabels partId={selection[0]} />}
      {!capturing && measurements.map((m, i) => <MeasureLine key={m.id} m={m} index={i} />)}
      {!capturing && pendingPoint && <PointMarker at={pendingPoint.point} kind={pendingPoint.snap} size={14} />}
      {!capturing && sheetCorner && <PointMarker at={sheetCorner.point} kind="vertex" size={16} />}
      {!capturing && measureHover && <PointMarker at={measureHover.point} kind={measureHover.snap} size={12} ghost />}
      {!capturing && guides.map((g, i) => (
        <Line key={i} points={[g.from, g.to]} color={g.kind === 'center' ? '#db2777' : '#0891b2'} lineWidth={2} dashed dashSize={20} gapSize={12} depthTest={false} />
      ))}

      {/* Plain line grids (10 cm cells, a stronger line every metre), faint —
          steadier than a shader grid; they sit clearly above the shadow floor
          so the two don't flicker against each other */}
      <gridHelper
        args={[20000, 200, '#9aa4b0', '#9aa4b0']}
        position={[0, -1, 0]}
        onUpdate={(g) => {
          const m = g.material as Material
          m.transparent = true
          m.opacity = 0.22
          m.depthWrite = false
        }}
      />
      <gridHelper
        args={[20000, 20, '#7a8896', '#7a8896']}
        position={[0, -0.9, 0]}
        onUpdate={(g) => {
          const m = g.material as Material
          m.transparent = true
          m.opacity = 0.45
          m.depthWrite = false
        }}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -6, 0]}
        receiveShadow
        // Only a click target while measuring, so a tap on empty floor still deselects otherwise
        onClick={
          moveMode
            ? (e) => {
                e.stopPropagation()
                const near = fuzzyPickRef.current?.(e.nativeEvent.clientX, e.nativeEvent.clientY, FUZZY_PX)
                if (near && !useStore.getState().selection.includes(near.partId)) return moveTap(near)
                moveTap({ floor: [e.point.x, 0, e.point.z] })
              }
            : placing
            ? (e) => {
                e.stopPropagation()
                // A tap that just misses a board counts as a tap on it
                const near = fuzzyPickRef.current?.(e.nativeEvent.clientX, e.nativeEvent.clientY, FUZZY_PX)
                if (near) return placeTap(near)
                const dist = controls ? controls.target.distanceTo(camera.position) : 3000
                placeTap({ floor: [e.point.x, 0, e.point.z], margin: Math.min(300, Math.max(40, dist * (isTouch ? 0.06 : 0.03))) })
              }
            : measureMode
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

      <OrbitControls
        makeDefault
        target={[500, 300, 0]}
        // Calmer on touch screens; a short glide after letting go
        rotateSpeed={isTouch ? 0.55 : 0.9}
        zoomSpeed={0.9}
        panSpeed={0.8}
        enableDamping
        dampingFactor={0.15}
      />
      {!capturing && (
        // On phones the bottom panel floats over the view, so the axes go top left
        <GizmoHelper alignment={isTouch ? 'top-left' : 'bottom-right'} margin={isTouch ? [50, 120] : [60, 60]}>
          <GizmoViewport labelColor="white" axisHeadScale={0.9} />
        </GizmoHelper>
      )}
    </>
  )
}

/** Bygg mode: what to do with the selection. */
function ActionBar() {
  const selection = useStore((s) => s.selection)
  const parts = useStore((s) => s.project.parts)
  const groups = useStore((s) => s.project.groups)
  const groupSelection = useStore((s) => s.groupSelection)
  const ungroup = useStore((s) => s.ungroup)
  const duplicateSelection = useStore((s) => s.duplicateSelection)
  const removeSelection = useStore((s) => s.removeSelection)
  const clearSelection = useStore((s) => s.clearSelection)
  const setMoveMode = useStore((s) => s.setMoveMode)
  const setRotateMode = useStore((s) => s.setRotateMode)
  const switchButt = useStore((s) => s.switchButtJoints)
  const ids = new Set(selection)
  const chosen = parts.filter((p) => ids.has(p.id))
  // Two boards meeting in a square corner: offer to swap which runs through
  // What ⇄ Byt stötfog would do: one corner (two boards) or the whole frame
  const butt = useMemo(() => (chosen.length ? switchButtJoints(selection, parts) : null), [selection, parts, chosen.length])
  // One placed board: the same "Annan riktning" as while placing
  const reorientSelection = useStore((s) => s.reorientSelection)
  const choice = useStore((s) => s.placeChoice)
  const note = useStore((s) => s.placeNote)
  // One lying sheet (with or without its frame) selected: build or change the frame under it
  const openFrame = useStore((s) => s.openFrame)
  const sheets = chosen.filter(isLyingSheet)
  const frameSheetId =
    sheets.length === 1 && chosen.every((p) => p.id === sheets[0].id || p.frameOf === sheets[0].id) ? sheets[0].id : null
  const canReorient = chosen.length === 1 && reorientOptions(chosen[0], parts).length > 1
  const showNote = canReorient && choice?.partId === chosen[0].id && note
  // Exactly one whole group selected?
  const gid = chosen[0]?.groupId
  const group =
    gid && chosen.every((p) => p.groupId === gid) && parts.filter((p) => p.groupId === gid).length === chosen.length
      ? groups.find((g) => g.id === gid)
      : undefined
  const label = group ? group.name : chosen.length === 1 ? chosen[0].name : `${chosen.length} delar`
  return (
    <div className="measure-top place-top">
      <div className="action-bar" role="toolbar" aria-label="Markerat">
        <div className="action-title">
          <strong>{label}</strong>
          <button className="link" onClick={clearSelection} aria-label="Avmarkera">
            ✕
          </button>
        </div>
        <div className="action-buttons">
          {group ? (
            <button onClick={() => ungroup(group.id)}>Dela upp</button>
          ) : (
            <button
              disabled={chosen.length < 2}
              onClick={() => groupSelection(`Grupp ${groups.length + 1}`)}
              title={chosen.length < 2 ? 'Tryck på fler delar för att gruppera' : undefined}
            >
              Gruppera
            </button>
          )}
          <button className="primary" onClick={() => setMoveMode(true)}>
            ✥ Flytta
          </button>
          <button className="primary" onClick={() => setRotateMode(true)}>
            ↻ Vrid
          </button>
          <button onClick={duplicateSelection} title="Duplicera">
            Kopiera
          </button>
          <button className="danger" onClick={removeSelection}>
            Ta bort
          </button>
        </div>
        {butt && (
          <button
            className="switch-butt"
            onClick={switchButt}
            title="Yttermåttet behålls: brädorna som går igenom blir längre, de andra kortare."
          >
            {butt.axis === undefined
              ? '⇄ Byt stötfog i hörnet'
              : `⇄ Låt ${AXIS_BOARDS[butt.axis]} gå igenom (${butt.corners.length} hörn)`}
          </button>
        )}
        {frameSheetId && (
          <button className="switch-butt" onClick={() => openFrame(frameSheetId)}>
            {parts.find((p) => p.id === frameSheetId)?.frame ? '▦ Ändra ramen under skivan' : '▦ Bygg ram under skivan'}
          </button>
        )}
        {canReorient && (
          <button className="switch-butt" onClick={reorientSelection} title="Prova nästa sätt att sätta brädan där den sitter">
            ⟳ Annan riktning
          </button>
        )}
        {showNote ? (
          <span className="action-hint">{note}</span>
        ) : (
          chosen.length === 1 && !group && <span className="action-hint">Tryck på fler delar för att markera dem också</span>
        )}
      </div>
    </div>
  )
}

const STEPS = [1, 5, 10, 50, 100]

/** Moving: step size, rotation, undo and done. The arrows are in the 3D view. */
function MoveBar() {
  const step = useStore((s) => s.settings.moveStep)
  const setSettings = useStore((s) => s.setSettings)
  const undo = useStore((s) => s.undo)
  const canUndo = useStore((s) => s.past.length > 0)
  const setMoveMode = useStore((s) => s.setMoveMode)
  return (
    <div className="measure-top place-top">
      <div className="place-banner move-bar" role="toolbar" aria-label="Flytta">
        <strong>Flytta</strong>
        <span>Tryck på pilarna — eller på en bräda där delen ska sitta</span>
        <div className="move-steps" role="group" aria-label="Steg">
          {STEPS.map((s) => (
            <button key={s} className={step === s ? 'on' : ''} aria-pressed={step === s} onClick={() => setSettings({ moveStep: s })}>
              {s}
            </button>
          ))}
          <label className="move-custom">
            <NumberField value={step} min={1} suffix="mm" onCommit={(v) => setSettings({ moveStep: v })} />
          </label>
        </div>
        <div className="place-actions">
          <button onClick={undo} disabled={!canUndo} aria-label="Ångra">
            ↶
          </button>
          <button className="primary" onClick={() => setMoveMode(false)}>
            Klar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Turning: 90° per tap on the rings in the view; plain buttons as a fallback. */
function RotateBar() {
  const rotateStep = useStore((s) => s.rotateSelectionStep)
  const undo = useStore((s) => s.undo)
  const canUndo = useStore((s) => s.past.length > 0)
  const setRotateMode = useStore((s) => s.setRotateMode)
  return (
    <div className="measure-top place-top">
      <div className="place-banner move-bar" role="toolbar" aria-label="Vrid">
        <strong>Vrid 90°</strong>
        <span>Tryck på pilarna på ringarna — eller här:</span>
        <div className="rotate-buttons">
          <button onClick={() => rotateStep(1, 1)} title="Vrid runt lodlinjen (grön ring)">
            <span className="ring-dot" style={{ background: AXIS_COLOR[1] }} />↻ Vrid
          </button>
          <button onClick={() => rotateStep(0, 1)} title="Tippa framåt/bakåt (röd ring)">
            <span className="ring-dot" style={{ background: AXIS_COLOR[0] }} />↻ Tippa
          </button>
          <button onClick={() => rotateStep(2, 1)} title="Tippa åt sidan (blå ring)">
            <span className="ring-dot" style={{ background: AXIS_COLOR[2] }} />↻ Sida
          </button>
        </div>
        <div className="place-actions">
          <button onClick={undo} disabled={!canUndo} aria-label="Ångra">
            ↶ Ångra
          </button>
          <button className="primary" onClick={() => setRotateMode(false)}>
            Klar
          </button>
        </div>
      </div>
    </div>
  )
}

const FRAME_PROFILES = PROFILES.filter(
  (p) => p.kind === 'board' && (p.category === 'konstruktion' || (p.category === 'hyvlat' && p.thickness >= 28)),
)

/** "Ram under skivan": profile, on edge or flat, number of joists — the frame updates live. */
function FrameBar() {
  const fs = useStore((s) => s.frameSheet)
  const sheet = useStore((s) => s.project.parts.find((p) => p.id === s.frameSheet?.base.id))
  const applyFrame = useStore((s) => s.applyFrame)
  const removeFrame = useStore((s) => s.removeFrame)
  const closeFrame = useStore((s) => s.closeFrame)
  if (!fs || !sheet?.frame) return null
  const f = sheet.frame
  const set = (patch: Partial<typeof f>) => applyFrame({ ...f, ...patch })
  const spacing = joistSpacing(fs.base, f)
  return (
    <div className="measure-top place-top">
      <div className="place-banner move-bar frame-bar" role="toolbar" aria-label="Ram under skivan">
        <strong>Ram under skivan</strong>
        <div className="frame-profiles" role="group" aria-label="Virke">
          {FRAME_PROFILES.map((p) => (
            <button key={p.id} className={`chip ${f.profileId === p.id ? 'on' : ''}`} aria-pressed={f.profileId === p.id} onClick={() => set({ profileId: p.id })}>
              {shortName(p)}
            </button>
          ))}
        </div>
        <div className="frame-row">
          <div className="segmented" role="group" aria-label="Hur reglarna ligger">
            <button className={f.onEdge ? 'on' : ''} aria-pressed={f.onEdge} onClick={() => set({ onEdge: true })}>
              På högkant
            </button>
            <button className={!f.onEdge ? 'on' : ''} aria-pressed={!f.onEdge} onClick={() => set({ onEdge: false })}>
              Flatt
            </button>
          </div>
        </div>
        <div className="frame-row frame-joists">
          <span>Tvärreglar</span>
          <button aria-label="Färre tvärreglar" disabled={f.joists <= 0} onClick={() => set({ joists: f.joists - 1 })}>
            −
          </button>
          <strong>{f.joists}</strong>
          <button aria-label="Fler tvärreglar" disabled={f.joists >= 20} onClick={() => set({ joists: f.joists + 1 })}>
            +
          </button>
          <span className="muted small">c/c {fmtMm(Math.round(spacing))} mm</span>
        </div>
        <div className="place-actions">
          <button className="danger" onClick={removeFrame}>
            Ta bort ramen
          </button>
          <button className="primary" onClick={closeFrame}>
            Klar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Placing boards: what to do, what the last tap did, and how to stop. */
function PlaceBanner({ profileId }: { profileId: string }) {
  const note = useStore((s) => s.placeNote)
  const setPlaceProfile = useStore((s) => s.setPlaceProfile)
  const addPart = useStore((s) => s.addPart)
  const undo = useStore((s) => s.undo)
  const canUndo = useStore((s) => s.past.length > 0)
  const choice = useStore((s) => s.placeChoice)
  const cyclePlacement = useStore((s) => s.cyclePlacement)
  const prof = getProfile(profileId)
  return (
    <div className="measure-top place-top">
      <div className="place-banner" role="status">
        <strong>Placera {prof.kind === 'sheet' ? prof.name : prof.name}</strong>
        <span>
          {note ??
            (prof.kind === 'sheet'
              ? 'Tryck på ett hörn där skivan ska börja — på golvet eller på en bräda. Sedan på motsatta hörnet.'
              : 'Tryck på en bräda – vid början, mitten eller änden – eller på golvet')}
        </span>
        {choice && choice.options.length > 1 && (
          <button className="place-cycle" onClick={cyclePlacement}>
            ⟳ Annan riktning{' '}
            <span className="muted small">
              {choice.index + 1}/{choice.options.length}
            </span>
          </button>
        )}
        <div className="place-actions">
          <button
            onClick={() => {
              addPart(profileId)
              setPlaceProfile(null)
            }}
          >
            Lägg till fritt
          </button>
          <button
            onClick={() => {
              undo()
              useStore.setState({ placeNote: 'Ångrat — tryck igen där den ska sitta', placeChoice: null, sheetCorner: null })
            }}
            disabled={!canUndo}
            aria-label="Ångra senaste"
          >
            ↶ Ångra
          </button>
          <button className="primary" onClick={() => setPlaceProfile(null)}>
            Klar
          </button>
        </div>
      </div>
    </div>
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

export function Viewport({
  capturing = false,
  immersive = false,
  onImmersive,
}: {
  capturing?: boolean
  immersive?: boolean
  onImmersive?: (on: boolean) => void
}) {
  const clearSelection = useStore((s) => s.clearSelection)
  const measureMode = useStore((s) => s.measureMode)
  const moveMode = useStore((s) => s.moveMode)
  const rotateMode = useStore((s) => s.rotateMode)
  const mode = useStore((s) => s.settings.mode)
  const setMeasureMode = useStore((s) => s.setMeasureMode)
  const pending = useStore((s) => s.pendingPoint !== null)
  const placeProfile = useStore((s) => s.placeProfile)
  const snapChoice = useStore((s) => s.snapChoice)
  const cycleSnap = useStore((s) => s.cycleSnap)
  const count = useStore((s) => s.selection.length)
  const lastDrag = useRef(0)
  const framing = useStore((s) => s.frameSheet !== null)
  const showActions = mode === 'bygg' && count > 0 && !placeProfile && !measureMode && !moveMode && !rotateMode && !framing

  return (
    <>
    {immersive && (
      <button className="show-menus" onClick={() => onImmersive?.(false)}>
        ☰ Visa menyer
      </button>
    )}
    <div className="view-buttons">
      <button className="icon" onClick={fitView} title="Visa hela modellen" aria-label="Visa hela modellen">
        ⤢
      </button>
      {onImmersive && !immersive && (
        <button className="icon" onClick={() => onImmersive(true)} title="Dölj menyerna" aria-label="Dölj menyerna">
          ⛶
        </button>
      )}
      <button
        className={`multi-toggle ${measureMode ? 'on measure' : ''}`}
        aria-pressed={measureMode}
        onClick={() => setMeasureMode(!measureMode)}
        title="Mät: tryck på två ytor eller golvet"
      >
        📏 Mät
      </button>
    </div>
    {placeProfile && <PlaceBanner profileId={placeProfile} />}
    {moveMode && count > 0 && <MoveBar />}
    {rotateMode && count > 0 && <RotateBar />}
    {framing && <FrameBar />}
    {showActions && <ActionBar />}
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
      // Only draw when something changes, not 60 times a second — saves the
      // phone's battery and keeps it responsive
      frameloop="demand"
      // Phones have 3x screens; 1.5x looks the same here and is far cheaper
      dpr={isTouch ? [1, 1.5] : [1, 2]}
      // A larger near plane gives better depth precision (less flicker)
      camera={{ position: [2500, 1800, 3000], fov: 45, near: 30, far: 60000 }}
      onPointerMissed={(e) => {
        // The move gizmo isn't a raycast target, so a drag on it ends in a "missed" click
        const st = useStore.getState()
        // Placing: a tap in the air next to a board still goes on the board
        if (st.placeProfile && e.type === 'click') {
          const near = fuzzyPickRef.current?.(e.clientX, e.clientY, FUZZY_PX)
          if (near) st.placeTap(near)
          return
        }
        // Moving: a tap next to a board moves the selection there
        if (st.moveMode && e.type === 'click') {
          const near = fuzzyPickRef.current?.(e.clientX, e.clientY, FUZZY_PX)
          if (near && !st.selection.includes(near.partId)) st.moveTap(near)
          return
        }
        if (e.type !== 'click' || Date.now() - lastDrag.current <= 200 || st.measureMode) return
        // A tap that just misses a thin board selects it — boards seen from an
        // angle are often thinner than a thumb. Only a clear miss deselects.
        const near = fuzzyPickRef.current?.(e.clientX, e.clientY, FUZZY_PX)
        if (near) st.pickPart(near.partId, e.shiftKey || e.ctrlKey || e.metaKey)
        else clearSelection()
      }}
    >
      <Scene lastDrag={lastDrag} capturing={capturing} />
    </Canvas>
    </>
  )
}
