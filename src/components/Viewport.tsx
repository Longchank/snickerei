import { Edges, GizmoHelper, GizmoViewport, Grid, OrbitControls, TransformControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Group } from 'three'
import { getProfile } from '../lib/catalog'
import { eulerOf, round } from '../lib/geometry'
import { useStore } from '../lib/store'
import type { Part } from '../lib/types'

type Register = (id: string, g: Group | null) => void

function PartMesh({ part, selected, register }: { part: Part; selected: boolean; register: Register }) {
  const select = useStore((s) => s.select)
  const ref = useRef<Group>(null)
  useEffect(() => {
    register(part.id, ref.current)
    return () => register(part.id, null)
  }, [part.id, register])
  const prof = getProfile(part.profileId)
  const [l, t, w] = [part.length, prof.thickness, prof.width]
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
          emissive={selected ? '#3b82f6' : hover ? '#555' : '#000'}
          emissiveIntensity={selected ? 0.35 : 0.15}
          roughness={0.8}
        />
        <Edges color={selected ? '#1d4ed8' : '#6b4f2a'} />
      </mesh>
    </group>
  )
}

export function Viewport() {
  const parts = useStore((s) => s.project.parts)
  const selectedId = useStore((s) => s.selectedId)
  const snap = useStore((s) => s.settings.snap)
  const select = useStore((s) => s.select)
  const updatePart = useStore((s) => s.updatePart)

  const lastDrag = useRef(0)
  const groups = useRef(new Map<string, Group>())
  // Bumped when parts mount/unmount so the gizmo can find a freshly added part
  const [, setVersion] = useState(0)
  const register = useCallback<Register>((id, g) => {
    if (g) groups.current.set(id, g)
    else groups.current.delete(id)
    setVersion((n) => n + 1)
  }, [])
  const selectedGroup = selectedId ? groups.current.get(selectedId) : undefined

  return (
    <Canvas
      shadows
      camera={{ position: [2500, 1800, 3000], fov: 45, near: 10, far: 100000 }}
      onPointerMissed={(e) => {
        // The move gizmo isn't a raycast target, so a drag on it ends in a "missed" click
        if (e.type === 'click' && Date.now() - lastDrag.current > 200) select(null)
      }}
    >
      <color attach="background" args={['#eef1f4']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3000, 6000, 4000]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-5000, 5000, 5000, -5000, 10, 20000]} />
      </directionalLight>

      {parts.map((p) => (
        <PartMesh
          key={p.id}
          part={p}
          selected={p.id === selectedId}
          register={register}
        />
      ))}

      {selectedGroup && selectedId && (
        <TransformControls
          object={selectedGroup}
          mode="translate"
          translationSnap={snap}
          size={0.8}
          onMouseDown={() => (lastDrag.current = Infinity)}
          onMouseUp={() => {
            lastDrag.current = Date.now()
            const pos = selectedGroup.position
            updatePart(selectedId, { position: [round(pos.x), round(pos.y), round(pos.z)] })
          }}
        />
      )}

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
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.9} />
      </GizmoHelper>
    </Canvas>
  )
}
