import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows, RoundedBox } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Project, Snapshot, SurfaceKey, SurfaceSettings, ViewKey } from '../types';
import { resolveWallpaperAsset } from '../lib/idb';

interface Props { project: Project; snapshot?: Snapshot; selected: SurfaceKey; onSelect?: (surface: SurfaceKey) => void; onTextureError?: (surface: SurfaceKey, message: string) => void; view: ViewKey; viewTick: number; canvasRef?: React.RefObject<HTMLCanvasElement | null>; }

function getCamera(view: ViewKey, w: number, d: number, h: number) {
  const y = Math.min(h - .35, 1.65);
  switch (view) {
    case 'front': return { position: [0, y, -d * .28], target: [0, h * .5, d * .5] };
    case 'back': return { position: [0, y, d * .28], target: [0, h * .5, -d * .5] };
    case 'left': return { position: [w * .25, y, 0], target: [-w * .5, h * .5, 0] };
    case 'right': return { position: [-w * .25, y, 0], target: [w * .5, h * .5, 0] };
    case 'ceiling': return { position: [0, .35, 0], target: [0, h, 0] };
    default: return { position: [w * .24, Math.min(h - .25, 1.9), d * .29], target: [-w * .09, h * .49, -d * .27] };
  }
}
function CameraRig({ view, viewTick, w, d, h, controls }: { view: ViewKey; viewTick: number; w: number; d: number; h: number; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const destination = useRef<THREE.Vector3 | null>(null);
  const target = useRef<THREE.Vector3 | null>(null);
  useEffect(() => { const preset = getCamera(view, w, d, h); destination.current = new THREE.Vector3(...preset.position); target.current = new THREE.Vector3(...preset.target); }, [view, viewTick, w, d, h]);
  useFrame((_, delta) => {
    if (!destination.current || !target.current || !controls.current) return;
    const factor = 1 - Math.exp(-delta * 5);
    camera.position.lerp(destination.current, factor);
    controls.current.target.lerp(target.current, factor);
    controls.current.update();
    if (camera.position.distanceTo(destination.current) < .005 && controls.current.target.distanceTo(target.current) < .005) { destination.current = null; target.current = null; }
  });
  return null;
}
function Wallpaper({ name, settings, width, height, onTextureError }: { name: SurfaceKey; settings: SurfaceSettings; width: number; height: number; onTextureError?: Props['onTextureError'] }) {
  const [loaded, setLoaded] = useState<{ reference: string; texture: THREE.Texture } | null>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  useEffect(() => {
    if (!settings.url) return;
    let active = true;
    let releaseAsset = () => {};
    let texture: THREE.Texture | null = null;
    void (async () => {
      try {
        const asset = await resolveWallpaperAsset(settings.url!);
        releaseAsset = asset.release;
        if (!active) { releaseAsset(); return; }
        texture = new THREE.TextureLoader().load(asset.src, imageTexture => {
          if (!active) { imageTexture.dispose(); return; }
          imageTexture.colorSpace = THREE.SRGBColorSpace;
          imageTexture.wrapS = THREE.RepeatWrapping;
          imageTexture.wrapT = THREE.RepeatWrapping;
          imageTexture.anisotropy = 8;
          setLoaded({ reference: settings.url!, texture: imageTexture });
        }, undefined, () => {
          if (active) onTextureError?.(name, `Could not decode “${settings.fileName || 'wallpaper'}”. Replace it and try again.`);
        });
      } catch (error) {
        if (active) onTextureError?.(name, (error as Error).message || 'The wallpaper asset could not be loaded.');
      }
    })();
    return () => { active = false; releaseAsset(); texture?.dispose(); };
  }, [settings.url, settings.fileName, name, onTextureError]);
  const texture = loaded?.reference === settings.url ? loaded.texture : null;
  const mapped = useMemo(() => {
    if (!texture) return null;
    const tex = texture.clone(); tex.needsUpdate = true;
    const image = texture.image as HTMLImageElement;
    const imageAspect = image?.width && image?.height ? image.width / image.height : 1;
    const surfaceAspect = width / height;
    let rx = 1, ry = 1;
    if (settings.fit === 'fit' || settings.fit === 'custom') { if (surfaceAspect > imageAspect) rx = surfaceAspect / imageAspect; else ry = imageAspect / surfaceAspect; }
    if (settings.fit === 'fill') { if (surfaceAspect > imageAspect) ry = imageAspect / surfaceAspect; else rx = surfaceAspect / imageAspect; }
    rx *= settings.scale * settings.repeatX; ry *= settings.scale * settings.repeatY;
    tex.repeat.set(rx, ry); tex.offset.set(settings.offsetX, settings.offsetY); tex.center.set(.5, .5); tex.rotation = settings.rotation * Math.PI / 180;
    return tex;
  }, [texture, settings.fit, settings.scale, settings.repeatX, settings.repeatY, settings.offsetX, settings.offsetY, settings.rotation, width, height]);
  useEffect(() => () => { mapped?.dispose(); }, [mapped]);
  useLayoutEffect(() => {
    if (!material.current) return;
    material.current.map = mapped;
    material.current.needsUpdate = true;
  }, [mapped]);
  return <meshStandardMaterial ref={material} color={mapped ? '#ffffff' : '#e9e4dc'} roughness={.9} side={THREE.FrontSide} />;
}
function Wall({ name, position, rotation, size, settings, selected, onSelect, onTextureError }: { name: SurfaceKey; position: [number, number, number]; rotation: [number, number, number]; size: [number, number]; settings: SurfaceSettings; selected: boolean; onSelect?: (s: SurfaceKey) => void; onTextureError?: Props['onTextureError'] }) {
  return <group position={position} rotation={rotation}>
    <mesh receiveShadow onClick={e => { e.stopPropagation(); onSelect?.(name); }}>
      <planeGeometry args={size} />
      <Wallpaper name={name} settings={settings} width={size[0]} height={size[1]} onTextureError={onTextureError} />
    </mesh>
    {selected && <mesh position={[0, 0, .009]} raycast={() => null}><planeGeometry args={size} /><meshBasicMaterial color="#ba8c60" transparent opacity={.055} depthWrite={false} side={THREE.DoubleSide} /></mesh>}
  </group>;
}
function Floor({ w, d, material }: { w: number; d: number; material: string }) {
  const color = material === 'walnut' ? '#8e6751' : material === 'stone' ? '#c7c4bc' : material === 'concrete' ? '#c6c7c4' : '#c29b73';
  const plankCount = Math.max(8, Math.round(w / .19));
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.018, 0]} receiveShadow><planeGeometry args={[w, d]} /><meshStandardMaterial color={color} roughness={.84} /></mesh>
    {(material === 'oak' || material === 'walnut') && Array.from({ length: plankCount - 1 }, (_, i) => <mesh key={i} position={[-w / 2 + (i + 1) * w / plankCount, -.013, 0]}><boxGeometry args={[.005, .001, d]} /><meshBasicMaterial color="#513c31" transparent opacity={.17} /></mesh>)}
  </group>;
}
function Furniture({ project, items }: { project: Project; items: string[] }) {
  if (project.mode === 'empty') return null;
  const w = project.width, d = project.length;
  const wood = '#8b6b50', ivory = '#ede8dd', fabric = '#b9b1a4', dark = '#494c48';
  return <group>
    {items.includes('sofa') && <group position={[0, 0, -d * .22]} rotation={[0, -.08, 0]}>
      <RoundedBox args={[Math.min(2.25, w * .59), .42, .76]} radius={.12} position={[0, .39, 0]} castShadow receiveShadow><meshStandardMaterial color={fabric} roughness={1} /></RoundedBox>
      <RoundedBox args={[Math.min(2.25, w * .59), .7, .2]} radius={.09} position={[0, .72, -.32]} castShadow><meshStandardMaterial color={fabric} roughness={1} /></RoundedBox>
      {[-1,1].map(i => <RoundedBox key={i} args={[.19,.54,.7]} radius={.07} position={[i * Math.min(.99,w*.27),.58,0]} castShadow><meshStandardMaterial color={fabric} roughness={1}/></RoundedBox>)}
      {[-.38,.34].map((x,i) => <RoundedBox key={x} args={[.42,.21,.4]} radius={.06} position={[x,.67,-.1]} rotation={[0,i ? -.15 : .1,-.1]}><meshStandardMaterial color={i ? '#d4cab9' : '#8c9c8d'} roughness={1}/></RoundedBox>)}
    </group>}
    {items.includes('bed') && <group position={[0,0,-d*.16]}>
      <RoundedBox args={[Math.min(2,w*.64),.25,Math.min(2.15,d*.48)]} radius={.07} position={[0,.3,0]} castShadow><meshStandardMaterial color={wood}/></RoundedBox>
      <RoundedBox args={[Math.min(1.93,w*.62),.23,Math.min(2.05,d*.46)]} radius={.07} position={[0,.49,0]} castShadow><meshStandardMaterial color={ivory} roughness={1}/></RoundedBox>
      <RoundedBox args={[Math.min(2,w*.64),.95,.13]} radius={.05} position={[0,.58,-Math.min(1.13,d*.25)]} castShadow><meshStandardMaterial color={fabric}/></RoundedBox>
      {[-.45,.45].map(x => <RoundedBox key={x} args={[.67,.13,.42]} radius={.06} position={[x,.66,-.58]} castShadow><meshStandardMaterial color="#f8f6ee"/></RoundedBox>)}
      <RoundedBox args={[Math.min(1.93,w*.62),.05,.82]} radius={.02} position={[0,.64,.46]}><meshStandardMaterial color="#aaafa2" roughness={1}/></RoundedBox>
    </group>}
    {items.includes('table') && <group position={[project.room_type === 'Office' ? 0 : w*.06,0,project.room_type === 'Office' ? -d*.1 : d*.18]}>
      <mesh position={[0,.42,0]} castShadow receiveShadow><cylinderGeometry args={[.57,.57,.07,48]} /><meshStandardMaterial color={wood} roughness={.64}/></mesh>
      <mesh position={[0,.22,0]} castShadow><cylinderGeometry args={[.065,.085,.42,16]}/><meshStandardMaterial color={wood}/></mesh>
      <mesh position={[0,.04,0]}><cylinderGeometry args={[.28,.28,.05,32]}/><meshStandardMaterial color={wood}/></mesh>
      <mesh position={[.13,.475,-.1]} castShadow><cylinderGeometry args={[.08,.065,.09,20]}/><meshStandardMaterial color="#e4dfd3"/></mesh>
    </group>}
    {items.includes('chair') && <group position={[-Math.min(w*.31,1.15),0,d*.13]} rotation={[0,.45,0]}>
      <RoundedBox args={[.68,.17,.68]} radius={.09} position={[0,.52,0]} castShadow><meshStandardMaterial color="#a28c77" roughness={1}/></RoundedBox>
      <RoundedBox args={[.68,.69,.15]} radius={.08} position={[0,.82,-.29]} castShadow><meshStandardMaterial color="#a28c77" roughness={1}/></RoundedBox>
      {[-.25,.25].flatMap(x => [-.25,.25].map(z => <mesh key={`${x}-${z}`} position={[x,.27,z]} castShadow><cylinderGeometry args={[.025,.025,.5,10]}/><meshStandardMaterial color={dark}/></mesh>))}
    </group>}
    {items.includes('wardrobe') && <group position={[w*.34,0,-d*.35]}>
      <RoundedBox args={[.75,Math.min(2.12,project.height-.3),.55]} radius={.015} position={[0,Math.min(2.12,project.height-.3)/2,-.05]} castShadow><meshStandardMaterial color="#b5a18c" roughness={.85}/></RoundedBox>
      <mesh position={[0,1,-.05]}><boxGeometry args={[.008,1.85,.56]}/><meshStandardMaterial color="#947d67"/></mesh>
    </group>}
    {items.includes('lamp') && <group position={[w*.35,0,d*.12]}>
      <mesh position={[0,.75,0]} castShadow><cylinderGeometry args={[.025,.04,1.5,12]}/><meshStandardMaterial color="#8a7967" metalness={.4} roughness={.5}/></mesh>
      <mesh position={[0,.035,0]}><cylinderGeometry args={[.2,.2,.06,24]}/><meshStandardMaterial color="#8a7967"/></mesh>
      <mesh position={[0,1.53,0]} castShadow><cylinderGeometry args={[.19,.33,.4,32,1,true]}/><meshStandardMaterial color="#e8ddcb" side={THREE.DoubleSide} emissive="#edcf9b" emissiveIntensity={.1}/></mesh>
      <pointLight position={[0,1.3,0]} intensity={.28} distance={3.3} color="#ffdcb1" />
    </group>}
    {items.includes('plant') && <group position={[-w*.39,0,-d*.36]}>
      <mesh position={[0,.22,0]} castShadow><cylinderGeometry args={[.19,.15,.43,18]}/><meshStandardMaterial color="#c7ac94" roughness={.9}/></mesh>
      {[0,1,2,3,4,5,6].map((i) => <mesh key={i} position={[Math.sin(i*2.4)*.17,.7+(i%3)*.15,Math.cos(i*2.4)*.14]} rotation={[.25,i*2.4,.3]} castShadow><sphereGeometry args={[.13,9,7]}/><meshStandardMaterial color={i%2 ? '#647c63' : '#718968'} roughness={1}/></mesh>)}
    </group>}
    {items.includes('frame') && <group position={[0,Math.min(1.65,project.height*.65),-d/2+.025]}>
      <mesh><boxGeometry args={[.81,.63,.035]}/><meshStandardMaterial color="#7b624b"/></mesh>
      <mesh position={[0,0,.024]}><planeGeometry args={[.73,.55]}/><meshStandardMaterial color="#d7d2c4"/></mesh>
      <mesh position={[-.1,-.04,.027]} rotation={[0,0,-.28]}><planeGeometry args={[.31,.33]}/><meshStandardMaterial color="#a8a899"/></mesh>
    </group>}
    {items.includes('curtains') && <group position={[-w*.34,0,-d/2+.06]}>
      <mesh position={[0,project.height*.58,0]}><boxGeometry args={[.7,project.height*.57,.05]}/><meshStandardMaterial color="#cfcbc1" roughness={1} side={THREE.DoubleSide}/></mesh>
      <mesh position={[0,project.height*.87,.04]}><boxGeometry args={[.88,.025,.06]}/><meshStandardMaterial color={dark}/></mesh>
    </group>}
    {items.includes('decor') && <group position={[w*.3,0,-d*.31]}>
      <mesh position={[0,.3,0]} castShadow><cylinderGeometry args={[.25,.3,.58,20]}/><meshStandardMaterial color="#b79e85"/></mesh>
      <mesh position={[0,.68,0]} castShadow><sphereGeometry args={[.14,18,12]}/><meshStandardMaterial color="#e6dfd1"/></mesh>
    </group>}
  </group>;
}
function Scene({ project, snapshot, selected, onSelect, onTextureError, view, viewTick }: Omit<Props,'canvasRef' | 'snapshot'> & { snapshot: Snapshot }) {
  const { width: w, length: d, height: h } = project;
  const controls = useRef<OrbitControlsImpl>(null);
  return <>
    <color attach="background" args={['#eeeae3']} />
    <ambientLight intensity={1.8} />
    <hemisphereLight args={['#ffffff', '#b6a492', 1.3]} />
    <directionalLight position={[-3,7,4]} intensity={2.2} castShadow shadow-mapSize={[2048,2048]} shadow-bias={-.0003} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} />
    <Wall name="front" position={[0,h/2,d/2]} rotation={[0,Math.PI,0]} size={[w,h]} settings={snapshot.surfaces.front} selected={selected === 'front'} onSelect={onSelect} onTextureError={onTextureError} />
    <Wall name="back" position={[0,h/2,-d/2]} rotation={[0,0,0]} size={[w,h]} settings={snapshot.surfaces.back} selected={selected === 'back'} onSelect={onSelect} onTextureError={onTextureError} />
    <Wall name="left" position={[-w/2,h/2,0]} rotation={[0,Math.PI/2,0]} size={[d,h]} settings={snapshot.surfaces.left} selected={selected === 'left'} onSelect={onSelect} onTextureError={onTextureError} />
    <Wall name="right" position={[w/2,h/2,0]} rotation={[0,-Math.PI/2,0]} size={[d,h]} settings={snapshot.surfaces.right} selected={selected === 'right'} onSelect={onSelect} onTextureError={onTextureError} />
    <Wall name="ceiling" position={[0,h,0]} rotation={[Math.PI/2,0,0]} size={[w,d]} settings={snapshot.surfaces.ceiling} selected={selected === 'ceiling'} onSelect={onSelect} onTextureError={onTextureError} />
    <Floor w={w} d={d} material={project.floor} />
    {[-w/2+.018,w/2-.018].map((x,i) => <mesh key={i} position={[x,.055,0]}><boxGeometry args={[.035,.11,d]}/><meshStandardMaterial color="#f5f1e9"/></mesh>)}
    {[-d/2+.018,d/2-.018].map((z,i) => <mesh key={i} position={[0,.055,z]}><boxGeometry args={[w,.11,.035]}/><meshStandardMaterial color="#f5f1e9"/></mesh>)}
    <Furniture project={project} items={snapshot.furniture} />
    <ContactShadows position={[0,.003,0]} opacity={.22} scale={Math.max(w,d)*1.5} blur={2.6} far={2.8} resolution={256}/>
    <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={.09} minDistance={.55} maxDistance={Math.max(w,d)*2.4} minPolarAngle={.04} maxPolarAngle={Math.PI-.04} enablePan zoomSpeed={.8} />
    <CameraRig view={view} viewTick={viewTick} w={w} d={d} h={h} controls={controls} />
  </>;
}
export default function RoomScene({ project, snapshot, selected, onSelect, onTextureError, view, viewTick, canvasRef }: Props) {
  return <Canvas shadows dpr={[1,2]} gl={{ preserveDrawingBuffer: true, antialias: true, toneMapping: THREE.NoToneMapping }} camera={{ position: [project.width*.24,Math.min(project.height-.25,1.9),project.length*.29], fov: 68, near: .04, far: 100 }} onCreated={({ gl }) => { if (canvasRef) canvasRef.current = gl.domElement; }}>
    <Scene project={project} snapshot={snapshot || project.snapshot} selected={selected} onSelect={onSelect} onTextureError={onTextureError} view={view} viewTick={viewTick} />
  </Canvas>;
}
