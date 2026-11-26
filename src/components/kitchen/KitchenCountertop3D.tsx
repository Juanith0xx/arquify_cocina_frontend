import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { useKitchenStore, CabinetType } from '../../store/kitchenStore';
import { useStore } from '../../store';
import { QSTONE_SINKS, FDV_COOKTOPS, SinkSpec } from '../../types/countertop';
import { detectContinuousCabinetRuns, ContinuousRunInfo } from '../../utils/countertopNesting';

// =========================================================================
// =========================================================================
// 3D MODEL: GRIFERÍA MONOMANDO FDV TOP PRO 4.0 (SAP: 15507)
// Altura total: 51.7 cm (517 mm) | Fondo / Alcance al difusor: 25.0 cm (250 mm)
// Terminación: Acero inoxidable satinado con resorte helicoidal y rociador extensible
// =========================================================================
function DeckMixerFaucet3D({ position }: { position: [number, number, number] }) {
  const isTransparent = useStore((s) => s.isTransparent);

  const getMatProps = (color: string, metalness = 0.94, roughness = 0.22) => ({
    color: isTransparent ? '#cbd5e1' : color,
    metalness: isTransparent ? 0.05 : metalness,
    roughness: isTransparent ? 0.1 : roughness,
    transparent: isTransparent,
    opacity: isTransparent ? 0.3 : 1,
    depthWrite: !isTransparent,
  });

  // Generación paramétrica exacta de la manguera flexible y el resorte helicoidal
  const { hoseGeo, springGeo } = useMemo(() => {
    // Parámetros dimensionales basados en la ficha técnica FDV TOP PRO 4.0 (Kitchen Center)
    const startY = 22.0;       // Altura de inicio sobre la columna rígida
    const centerArcY = 39.2;   // Centro del arco semicircular
    const radiusArc = 12.5;    // Radio del arco (12.5 cm -> Cúspide exacta en Y = 39.2 + 12.5 = 51.7 cm)
    const reachZ = 25.0;       // Alcance frontal al eje del cabezal (25.0 cm = 250 mm)
    const endHoseY = 24.0;     // Altura final donde conecta al cabezal difusor
    const endSpringY = 30.5;   // Altura donde remata el resorte helicoidal en su casquillo

    // 1. Curva de la manguera flexible interior
    const hosePoints: THREE.Vector3[] = [];
    hosePoints.push(new THREE.Vector3(0, startY, 0));
    hosePoints.push(new THREE.Vector3(0, 30.0, 0));
    hosePoints.push(new THREE.Vector3(0, centerArcY, 0));

    const arcSegments = 24;
    for (let i = 1; i < arcSegments; i++) {
      const theta = (Math.PI * i) / arcSegments;
      const z = radiusArc - radiusArc * Math.cos(theta);
      const y = centerArcY + radiusArc * Math.sin(theta);
      hosePoints.push(new THREE.Vector3(0, y, z));
    }

    hosePoints.push(new THREE.Vector3(0, centerArcY, reachZ));
    hosePoints.push(new THREE.Vector3(0, 32.0, reachZ));
    hosePoints.push(new THREE.Vector3(0, endHoseY, reachZ));

    const hoseCurve = new THREE.CatmullRomCurve3(hosePoints, false, 'centripetal');
    const hGeo = new THREE.TubeGeometry(hoseCurve, 64, 0.65, 16, false);

    // 2. Resorte helicoidal exterior continuo
    const l1 = centerArcY - startY;      // 17.2 cm tramo vertical
    const l2 = Math.PI * radiusArc;      // 39.27 cm tramo de arco
    const l3 = centerArcY - endSpringY;  // 8.7 cm tramo descendente
    const lTot = l1 + l2 + l3;

    const numCoils = 24;                 // Número de vueltas de espiral
    const springRadius = 1.35;           // Radio exterior de las espiras (abraza la manguera de radio 0.65)
    const sampleSteps = 380;             // Muestreo denso para suavidad de la curva
    const springPoints: THREE.Vector3[] = [];

    for (let i = 0; i <= sampleSteps; i++) {
      const u = i / sampleSteps;
      const s = u * lTot;
      let yc = 0;
      let zc = 0;
      let ny = 0;
      let nz = 0;

      if (s <= l1) {
        // Vertical ascendente
        yc = startY + s;
        zc = 0;
        ny = 0;
        nz = 1;
      } else if (s <= l1 + l2) {
        // Arco semicircular
        const theta = (s - l1) / radiusArc;
        zc = radiusArc - radiusArc * Math.cos(theta);
        yc = centerArcY + radiusArc * Math.sin(theta);
        ny = -Math.sin(theta);
        nz = Math.cos(theta);
      } else {
        // Vertical descendente
        const dDown = s - (l1 + l2);
        yc = centerArcY - dDown;
        zc = reachZ;
        ny = 0;
        nz = -1;
      }

      const phi = 2 * Math.PI * numCoils * u;
      const x = springRadius * Math.cos(phi);
      const y = yc + springRadius * Math.sin(phi) * ny;
      const z = zc + springRadius * Math.sin(phi) * nz;

      springPoints.push(new THREE.Vector3(x, y, z));
    }

    const sCurve = new THREE.CatmullRomCurve3(springPoints, false, 'centripetal');
    const sGeo = new THREE.TubeGeometry(sCurve, 280, 0.16, 6, false);

    return { hoseGeo: hGeo, springGeo: sGeo };
  }, []);

  return (
    <group position={position}>
      {/* 1. Base y anillo de asiento sobre cubierta */}
      <mesh position={[0, 0.35, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
        <cylinderGeometry args={[2.6, 2.7, 0.7, 32]} />
        <meshStandardMaterial {...getMatProps('#cbd5e1', 0.96, 0.18)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>
      <mesh position={[0, 0.9, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
        <cylinderGeometry args={[2.3, 2.5, 0.4, 32]} />
        <meshStandardMaterial {...getMatProps('#94a3b8', 0.92, 0.22)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>

      {/* 2. Cuerpo cilíndrico principal inferior */}
      <mesh position={[0, 5.5, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
        <cylinderGeometry args={[2.2, 2.2, 8.8, 32]} />
        <meshStandardMaterial {...getMatProps('#e2e8f0', 0.95, 0.18)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>
      <mesh position={[0, 10.1, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
        <cylinderGeometry args={[2.3, 2.3, 0.4, 32]} />
        <meshStandardMaterial {...getMatProps('#cbd5e1', 0.92, 0.22)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>

      {/* Maneta monomando lateral derecha (+X) */}
      <group position={[2.2, 5.8, 0.4]} rotation={[0, -0.2, -0.3]}>
        {/* Carcasa lateral del cartucho */}
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[1.25, 1.25, 1.4, 24]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.95, 0.18)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Casquillo giratorio de la manilla */}
        <mesh position={[1.1, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[1.15, 1.25, 0.9, 24]} />
          <meshStandardMaterial {...getMatProps('#e2e8f0', 0.96, 0.16)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Palanca cilíndrica esbelta estilizada */}
        <mesh position={[1.1, 3.6, 0.2]} rotation={[0.1, 0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[0.38, 0.38, 6.8, 16]} />
          <meshStandardMaterial {...getMatProps('#f1f5f9', 0.98, 0.14)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Remate superior redondeado de la palanca */}
        <mesh position={[1.1, 7.0, 0.2]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <sphereGeometry args={[0.42, 16, 16]} />
          <meshStandardMaterial {...getMatProps('#f1f5f9', 0.98, 0.14)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      </group>

      {/* 3. Columna vertical rígida de acero */}
      <mesh position={[0, 16.2, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
        <cylinderGeometry args={[1.35, 1.35, 11.8, 32]} />
        <meshStandardMaterial {...getMatProps('#e2e8f0', 0.95, 0.18)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>

      {/* 4. Brazo horizontal de retención y soporte del cabezal */}
      <group position={[0, 21.6, 0]}>
        {/* Collarín giratorio de unión a la columna */}
        <mesh position={[0, 0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[1.55, 1.55, 1.4, 28]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.96, 0.18)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Barra horizontal orientada en +Z hacia el centro del lavaplatos */}
        <mesh position={[0, 0, 11.5]} rotation={[Math.PI / 2, 0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[0.55, 0.55, 23.0, 20]} />
          <meshStandardMaterial {...getMatProps('#e2e8f0', 0.95, 0.18)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Soporte frontal / horquilla donde descansa el cabezal en Z = 25.0 */}
        <mesh position={[0, 0, 23.6]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[1.4, 1.2, 1.6]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.95, 0.18)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        <mesh position={[0, 0, 25.0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[1.7, 1.7, 1.4, 24]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.95, 0.18)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      </group>

      {/* 5. Muelle de soporte denso en la base (strain relief collar) */}
      {[0, 1, 2, 3, 4, 5, 6].map((idx) => (
        <mesh key={`dense-ring-${idx}`} position={[0, 22.5 + idx * 0.45, 0]}>
          <torusGeometry args={[1.35, 0.18, 8, 24]} />
          <meshStandardMaterial {...getMatProps('#e2e8f0', 0.96, 0.16)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      ))}

      {/* Manguera flexible interior trenzada (gris grafito) */}
      <mesh geometry={hoseGeo} castShadow={!isTransparent} receiveShadow={!isTransparent}>
        <meshStandardMaterial {...getMatProps('#334155', 0.15, 0.65)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>

      {/* Resorte helicoidal exterior continuo (acero inoxidable) */}
      <mesh geometry={springGeo} castShadow={!isTransparent} receiveShadow={!isTransparent}>
        <meshStandardMaterial {...getMatProps('#e2e8f0', 0.96, 0.16)} />
      </mesh>

      {/* Virola / casquillo de remate del resorte en Z = 25.0 */}
      <mesh position={[0, 30.5, 25.0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
        <cylinderGeometry args={[1.35, 1.45, 1.2, 24]} />
        <meshStandardMaterial {...getMatProps('#cbd5e1', 0.96, 0.18)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>
      <mesh position={[0, 29.8, 25.0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
        <cylinderGeometry args={[1.15, 1.35, 0.4, 24]} />
        <meshStandardMaterial {...getMatProps('#94a3b8', 0.92, 0.22)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>

      {/* 6. Cabezal difusor profesional (Spray Head) centrado en Z = 25.0 */}
      <group position={[0, 0, 25.0]}>
        {/* Casquillo superior de conexión a manguera */}
        <mesh position={[0, 24.0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[1.1, 1.2, 1.2, 24]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.95, 0.18)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Cuello cilíndrico que calza en el anillo del soporte horizontal */}
        <mesh position={[0, 22.4, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[1.25, 1.25, 2.0, 24]} />
          <meshStandardMaterial {...getMatProps('#e2e8f0', 0.96, 0.16)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Cuerpo cónico ergonómico acampanado */}
        <mesh position={[0, 19.3, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[1.25, 2.05, 4.2, 28]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.95, 0.18)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Selector basculante negro mate de doble chorro (orientado hacia el frente) */}
        <mesh position={[0, 19.3, 1.55]} rotation={[-0.1, 0, 0]} castShadow={!isTransparent}>
          <boxGeometry args={[0.85, 2.2, 0.45]} />
          <meshStandardMaterial {...getMatProps('#1e293b', 0.1, 0.7)} />
        </mesh>
        {/* Aro inferior cromado de la boquilla */}
        <mesh position={[0, 17.0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[2.05, 1.9, 0.4, 28]} />
          <meshStandardMaterial {...getMatProps('#e2e8f0', 0.96, 0.16)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Placa difusora microperforada de salida de agua */}
        <mesh position={[0, 16.75, 0]}>
          <cylinderGeometry args={[1.75, 1.75, 0.12, 28]} />
          <meshStandardMaterial {...getMatProps('#1e293b', 0.2, 0.5)} />
        </mesh>
      </group>
    </group>
  );
}

// =========================================================================
// 3D MODEL: CESTA Y VÁLVULA DE DESAGÜE Ø90mm CON RANURAS RADIALES
// =========================================================================
function DrainBasketStrainer3D({ position }: { position: [number, number, number] }) {
  const isTransparent = useStore((s) => s.isTransparent);
  const getMatProps = (color: string, _ignoredMetalness?: number, _ignoredRoughness?: number) => ({
    color: isTransparent ? '#cbd5e1' : color,
    metalness: isTransparent ? 0.05 : 0.3,
    roughness: isTransparent ? 0.1 : 0.32,
    transparent: isTransparent,
    opacity: isTransparent ? 0.3 : 1,
    depthWrite: !isTransparent,
  });

  return (
    <group position={position}>
      {/* Aro exterior cromado en el fondo */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.2, 5.8, 32]} />
        <meshStandardMaterial {...getMatProps('#f1f5f9', 0.98, 0.12)} side={THREE.DoubleSide} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>

      {/* Copa de drenaje profunda */}
      <mesh position={[0, -0.8, 0]}>
        <cylinderGeometry args={[4.2, 3.6, 1.6, 32]} />
        <meshStandardMaterial {...getMatProps('#64748b', 0.88, 0.25)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>

      {/* Canastillo colador con fondo perforado */}
      <mesh position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.8, 32]} />
        <meshStandardMaterial {...getMatProps('#94a3b8', 0.92, 0.2)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>

      {/* Ranuras oscuras radiales simuladas del colador */}
      {[0, 45, 90, 135].map((angle, idx) => (
        <mesh key={idx} position={[0, -0.38, 0]} rotation={[-Math.PI / 2, 0, (angle * Math.PI) / 180]}>
          <planeGeometry args={[0.4, 2.6]} />
          <meshBasicMaterial
            color={isTransparent ? '#cbd5e1' : '#1e293b'}
            transparent={isTransparent}
            opacity={isTransparent ? 0.3 : 1}
            depthWrite={!isTransparent}
          />
        </mesh>
      ))}

      {/* Perilla central cilíndrica para jalar el tapón */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 1.8, 20]} />
        <meshStandardMaterial {...getMatProps('#e2e8f0', 0.98, 0.12)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.65, 16, 16]} />
        <meshStandardMaterial {...getMatProps('#e2e8f0', 0.98, 0.12)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>
    </group>
  );
}

// =========================================================================
// 3D MODEL: REBOSADERO VERTICAL (OVERFLOW SLOTS)
// =========================================================================
function OverflowSlots3D({ position }: { position: [number, number, number] }) {
  const isTransparent = useStore((s) => s.isTransparent);
  return (
    <group position={position}>
      {/* Placa posterior oscura */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[4.5, 2.2, 0.1]} />
        <meshStandardMaterial
          key={isTransparent ? 'transp' : 'solid'}
          color={isTransparent ? '#cbd5e1' : '#0f172a'}
          roughness={isTransparent ? 0.1 : 0.8}
          transparent={isTransparent}
          opacity={isTransparent ? 0.3 : 1}
          depthWrite={!isTransparent}
        />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>
      {/* 4 Ranuras verticales de acero inoxidable */}
      {[-1.5, -0.5, 0.5, 1.5].map((x, idx) => (
        <mesh key={idx} position={[x, 0, 0.05]}>
          <boxGeometry args={[0.35, 1.6, 0.1]} />
          <meshStandardMaterial
            key={isTransparent ? 'transp' : 'solid'}
            color={isTransparent ? '#cbd5e1' : '#e2e8f0'}
            metalness={isTransparent ? 0.05 : 0.3}
            roughness={isTransparent ? 0.1 : 0.3}
            transparent={isTransparent}
            opacity={isTransparent ? 0.3 : 1}
            depthWrite={!isTransparent}
          />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      ))}
    </group>
  );
}

// =========================================================================
// 3D MODEL: LAVAPLATOS BAJO CUBIERTA REALISTA (ALFA ONEC 3018)
// =========================================================================
function AlfaOnec3018Realistic({
  position,
  stoneThicknessCm,
}: {
  position: [number, number, number];
  stoneThicknessCm: number;
}) {
  const isTransparent = useStore((s) => s.isTransparent);
  const spec = QSTONE_SINKS.alfa_onec_3018!;
  const w = spec.cutoutWidthMm / 10; // 69.5 cm
  const d = spec.cutoutDepthMm / 10; // 40.0 cm
  const h = 22; // 22 cm profundidad de bacin
  const wallThick = 0.35; // 3.5mm acero

  const getMatProps = (color: string, _ignoredMetalness?: number, _ignoredRoughness?: number) => ({
    color: isTransparent ? '#cbd5e1' : color,
    metalness: isTransparent ? 0.05 : 0.28,
    roughness: isTransparent ? 0.1 : 0.35,
    transparent: isTransparent,
    opacity: isTransparent ? 0.3 : 1,
    depthWrite: !isTransparent,
  });

  return (
    <group position={position}>
      {/* Pestaña perimetral superior que se fija BAJO la piedra (undermount flange con vano abierto) */}
      <group position={[0, -stoneThicknessCm - 0.15, 0]}>
        {/* Tira izquierda de pestaña */}
        <mesh position={[-w / 2 - 1.5, 0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[3, 0.3, d + 6]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1')} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Tira derecha de pestaña */}
        <mesh position={[w / 2 + 1.5, 0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[3, 0.3, d + 6]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1')} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Tira frontal de pestaña */}
        <mesh position={[0, 0, d / 2 + 1.5]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[w, 0.3, 3]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1')} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Tira trasera de pestaña */}
        <mesh position={[0, 0, -d / 2 - 1.5]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[w, 0.3, 3]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1')} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      </group>

      {/* CUBA PRINCIPAL PROFUNDA */}
      <group position={[0, -stoneThicknessCm - h / 2, 0]}>
        {/* Fondo metálico de la poza con leve declive */}
        <mesh position={[0, -h / 2 + wallThick / 2, 0]} receiveShadow={!isTransparent} castShadow={!isTransparent}>
          <boxGeometry args={[w, wallThick, d]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.94, 0.22)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>

        {/* Líneas en cruz prensadas en el fondo ("X" drainage channels) */}
        {[-0.5, 0.5].map((side, i) => (
          <mesh
            key={i}
            position={[0, -h / 2 + wallThick + 0.04, 0]}
            rotation={[-Math.PI / 2, 0, Math.atan2(d, w) * side]}
          >
            <planeGeometry args={[Math.hypot(w, d) * 0.88, 0.12]} />
            <meshBasicMaterial
              color={isTransparent ? '#cbd5e1' : '#94a3b8'}
              transparent={isTransparent}
              opacity={isTransparent ? 0.3 : 1}
              depthWrite={!isTransparent}
            />
          </mesh>
        ))}

        {/* Pared trasera */}
        <mesh position={[0, 0, -d / 2 + wallThick / 2]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[w, h, wallThick]} />
          <meshStandardMaterial {...getMatProps('#e2e8f0', 0.94, 0.2)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>

        {/* Pared frontal */}
        <mesh position={[0, 0, d / 2 - wallThick / 2]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[w, h, wallThick]} />
          <meshStandardMaterial {...getMatProps('#e2e8f0', 0.94, 0.2)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>

        {/* Pared lateral izquierda */}
        <mesh position={[-w / 2 + wallThick / 2, 0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[wallThick, h, d]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.94, 0.22)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>

        {/* Pared lateral derecha */}
        <mesh position={[w / 2 - wallThick / 2, 0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[wallThick, h, d]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.94, 0.22)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>

        {/* Válvula y canastillo de desagüe en el fondo */}
        <DrainBasketStrainer3D position={[0, -h / 2 + wallThick + 0.05, -3]} />

        {/* Rebosadero vertical en la pared posterior */}
        <OverflowSlots3D position={[0, h / 2 - 4.5, -d / 2 + wallThick + 0.05]} />
      </group>

      {/* Grifería Monomando montada en la cubierta detrás de la poza */}
      <DeckMixerFaucet3D position={[0, 0, -d / 2 - 5]} />
    </group>
  );
}

// =========================================================================
// 3D MODEL: LAVAPLATOS BAJO CUBIERTA REALISTA (ALFA TWOC F5858A - 2 CUBAS)
// =========================================================================
function AlfaTwocF5858aRealistic({
  position,
  stoneThicknessCm,
}: {
  position: [number, number, number];
  stoneThicknessCm: number;
}) {
  const isTransparent = useStore((s) => s.isTransparent);
  const spec = QSTONE_SINKS.alfa_twoc_f5858a!;
  const w = spec.cutoutWidthMm / 10; // 73 cm
  const d = spec.cutoutDepthMm / 10; // 40 cm
  const h = 21;
  const bowlW = (w - 2.5) / 2; // ~35.2 cm por cuba
  const wallThick = 0.35;

  const getMatProps = (color: string, _ignoredMetalness?: number, _ignoredRoughness?: number) => ({
    color: isTransparent ? '#cbd5e1' : color,
    metalness: isTransparent ? 0.05 : 0.28,
    roughness: isTransparent ? 0.1 : 0.35,
    transparent: isTransparent,
    opacity: isTransparent ? 0.3 : 1,
    depthWrite: !isTransparent,
  });

  return (
    <group position={position}>
      {/* Pestaña perimetral superior con vano abierto */}
      <group position={[0, -stoneThicknessCm - 0.15, 0]}>
        {/* Tira izquierda de pestaña */}
        <mesh position={[-w / 2 - 1.5, 0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[3, 0.3, d + 6]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1')} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Tira derecha de pestaña */}
        <mesh position={[w / 2 + 1.5, 0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[3, 0.3, d + 6]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1')} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Tira frontal de pestaña */}
        <mesh position={[0, 0, d / 2 + 1.5]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[w, 0.3, 3]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1')} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        {/* Tira trasera de pestaña */}
        <mesh position={[0, 0, -d / 2 - 1.5]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[w, 0.3, 3]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1')} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      </group>

      {/* Puente divisor central entre las dos cubas */}
      <mesh position={[0, -stoneThicknessCm - 1.5, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
        <boxGeometry args={[2.5, 3, d]} />
        <meshStandardMaterial {...getMatProps('#e2e8f0', 0.95, 0.18)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>

      {/* CUBA IZQUIERDA */}
      <group position={[-w / 2 + bowlW / 2, -stoneThicknessCm - h / 2, 0]}>
        <mesh position={[0, -h / 2 + wallThick / 2, 0]} receiveShadow={!isTransparent} castShadow={!isTransparent}>
          <boxGeometry args={[bowlW, wallThick, d]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.94, 0.22)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        <mesh position={[0, 0, -d / 2 + wallThick / 2]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[bowlW, h, wallThick]} />
          <meshStandardMaterial {...getMatProps('#e2e8f0', 0.94, 0.2)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        <mesh position={[0, 0, d / 2 - wallThick / 2]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[bowlW, h, wallThick]} />
          <meshStandardMaterial {...getMatProps('#e2e8f0', 0.94, 0.2)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        <mesh position={[-bowlW / 2 + wallThick / 2, 0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[wallThick, h, d]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.94, 0.22)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        <DrainBasketStrainer3D position={[0, -h / 2 + wallThick + 0.05, -2]} />
      </group>

      {/* CUBA DERECHA */}
      <group position={[w / 2 - bowlW / 2, -stoneThicknessCm - h / 2, 0]}>
        <mesh position={[0, -h / 2 + wallThick / 2, 0]} receiveShadow={!isTransparent} castShadow={!isTransparent}>
          <boxGeometry args={[bowlW, wallThick, d]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.94, 0.22)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        <mesh position={[0, 0, -d / 2 + wallThick / 2]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[bowlW, h, wallThick]} />
          <meshStandardMaterial {...getMatProps('#e2e8f0', 0.94, 0.2)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        <mesh position={[0, 0, d / 2 - wallThick / 2]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[bowlW, h, wallThick]} />
          <meshStandardMaterial {...getMatProps('#e2e8f0', 0.94, 0.2)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        <mesh position={[bowlW / 2 - wallThick / 2, 0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <boxGeometry args={[wallThick, h, d]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.94, 0.22)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        <DrainBasketStrainer3D position={[0, -h / 2 + wallThick + 0.05, -2]} />
        <OverflowSlots3D position={[0, h / 2 - 4.5, -d / 2 + wallThick + 0.05]} />
      </group>

      {/* Grifería Monomando montada centralmente en la cubierta detrás de las dos pozas */}
      <DeckMixerFaucet3D position={[0, 0, -d / 2 - 5]} />
    </group>
  );
}

// =========================================================================
// 3D MODEL: ENCIMERAS A GAS FDV (SOBRECUBIERTA)
// =========================================================================
function FdvDesign60Model({ position }: { position: [number, number, number] }) {
  const isTransparent = useStore((s) => s.isTransparent);
  const getMatProps = (color: string, _ignoredMetalness?: number, _ignoredRoughness?: number) => ({
    color: isTransparent ? '#cbd5e1' : color,
    metalness: isTransparent ? 0.05 : 0.35,
    roughness: isTransparent ? 0.1 : 0.3,
    transparent: isTransparent,
    opacity: isTransparent ? 0.3 : 1,
    depthWrite: !isTransparent,
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.6, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
        <boxGeometry args={[58, 1.2, 50]} />
        <meshStandardMaterial {...getMatProps('#e2e8f0', 0.88, 0.2)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>
      <mesh position={[0, 1.25, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
        <boxGeometry args={[57.2, 0.1, 49.2]} />
        <meshStandardMaterial {...getMatProps('#94a3b8', 0.95, 0.15)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>
      {/* 4 Quemadores con parrillas */}
      <group position={[-15, 1.6, 12]}>
        <mesh castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[5.5, 6, 0.6, 32]} />
          <meshStandardMaterial {...getMatProps('#1e293b', 0.2, 0.8)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        <mesh position={[0, 0.4, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[2, 2, 0.8, 24]} />
          <meshStandardMaterial {...getMatProps('#eab308', 0.8, 0.3)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      </group>
      <group position={[-15, 1.6, -12]}>
        <mesh castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[4, 4.5, 0.6, 24]} />
          <meshStandardMaterial {...getMatProps('#1e293b', 0.2, 0.8)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      </group>
      <group position={[15, 1.6, -12]}>
        <mesh castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[4.8, 5.2, 0.6, 24]} />
          <meshStandardMaterial {...getMatProps('#1e293b', 0.2, 0.8)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      </group>
      <group position={[15, 1.6, 12]}>
        <mesh castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[3.2, 3.8, 0.6, 24]} />
          <meshStandardMaterial {...getMatProps('#1e293b', 0.2, 0.8)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      </group>
      {/* 4 Perillas de control */}
      {[-12, -4, 4, 12].map((x, idx) => (
        <mesh key={idx} position={[x, 1.5, 20]} rotation={[0.2, 0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[1.2, 1.2, 0.8, 16]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.9, 0.2)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      ))}
    </group>
  );
}

function FdvDesign90Model({ position }: { position: [number, number, number] }) {
  const isTransparent = useStore((s) => s.isTransparent);
  const getMatProps = (color: string, _ignoredMetalness?: number, _ignoredRoughness?: number) => ({
    color: isTransparent ? '#cbd5e1' : color,
    metalness: isTransparent ? 0.05 : 0.35,
    roughness: isTransparent ? 0.1 : 0.3,
    transparent: isTransparent,
    opacity: isTransparent ? 0.3 : 1,
    depthWrite: !isTransparent,
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.7, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
        <boxGeometry args={[86, 1.4, 50]} />
        <meshStandardMaterial {...getMatProps('#e2e8f0', 0.88, 0.2)} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>
      {/* Quemador Wok central triple corona */}
      <group position={[0, 1.8, 0]}>
        <mesh castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[6.5, 7.5, 0.8, 32]} />
          <meshStandardMaterial {...getMatProps('#1e293b', 0.2, 0.8)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
        <mesh position={[0, 0.5, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[2.5, 2.5, 1.0, 24]} />
          <meshStandardMaterial {...getMatProps('#eab308', 0.8, 0.3)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      </group>
      {/* 4 quemadores laterales */}
      <group position={[-28, 1.6, 12]}>
        <mesh castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[4.2, 4.8, 0.6, 24]} />
          <meshStandardMaterial {...getMatProps('#1e293b', 0.2, 0.8)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      </group>
      <group position={[-28, 1.6, -12]}>
        <mesh castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[4.8, 5.2, 0.6, 24]} />
          <meshStandardMaterial {...getMatProps('#1e293b', 0.2, 0.8)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      </group>
      <group position={[28, 1.6, 12]}>
        <mesh castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[3.2, 3.8, 0.6, 24]} />
          <meshStandardMaterial {...getMatProps('#1e293b', 0.2, 0.8)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      </group>
      <group position={[28, 1.6, -12]}>
        <mesh castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[4.2, 4.8, 0.6, 24]} />
          <meshStandardMaterial {...getMatProps('#1e293b', 0.2, 0.8)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      </group>
      {/* 5 Perillas frontales */}
      {[-16, -8, 0, 8, 16].map((x, idx) => (
        <mesh key={idx} position={[x, 1.6, 20]} rotation={[0.2, 0, 0]} castShadow={!isTransparent} receiveShadow={!isTransparent}>
          <cylinderGeometry args={[1.2, 1.2, 0.8, 16]} />
          <meshStandardMaterial {...getMatProps('#cbd5e1', 0.9, 0.2)} />
          {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
        </mesh>
      ))}
    </group>
  );
}

// =========================================================================
// MALLA MONOLÍTICA DE CUBIERTA SIMULADA SEMITRANSPARENTE (SIN HUINCHAS NI COSTURAS)
// =========================================================================
function SimulatedPreviewCountertopMesh({
  cabW,
  cabD,
  ctThick,
  cutoutW,
  cutoutD,
  simMatProps,
}: {
  cabW: number;
  cabD: number;
  ctThick: number;
  cutoutW: number;
  cutoutD: number;
  simMatProps: any;
}) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape();
    const halfW = cabW / 2;
    const ctDepth = cabD + 2;
    const halfD = ctDepth / 2;

    shape.moveTo(-halfW, -halfD);
    shape.lineTo(halfW, -halfD);
    shape.lineTo(halfW, halfD);
    shape.lineTo(-halfW, halfD);
    shape.closePath();

    if (cutoutW > 0 && cutoutD > 0) {
      const hole = new THREE.Path();
      const hLeft = -cutoutW / 2;
      const hRight = cutoutW / 2;
      const hBack = -cutoutD / 2;
      const hFront = cutoutD / 2;
      hole.moveTo(hLeft, hBack);
      hole.lineTo(hRight, hBack);
      hole.lineTo(hRight, hFront);
      hole.lineTo(hLeft, hFront);
      hole.closePath();
      shape.holes.push(hole);
    }

    const g = new THREE.ExtrudeGeometry(shape, {
      depth: ctThick,
      bevelEnabled: false,
    });
    g.rotateX(Math.PI / 2);
    g.translate(0, ctThick, 0);
    g.computeVertexNormals();
    return g;
  }, [cabW, cabD, ctThick, cutoutW, cutoutD]);

  return (
    <mesh position={[0, 0, 1.0]} geometry={geom} castShadow={false} receiveShadow={false}>
      <meshStandardMaterial {...simMatProps} />
      <Edges scale={1} threshold={15} color="#94a3b8" />
    </mesh>
  );
}

// =========================================================================
// MALLA MONOLÍTICA DE TRAMO DE CUBIERTA REAL CON CALADOS CNC INDEPENDIENTES
// =========================================================================
function ContinuousSlabSegmentMesh({
  totalSegSlabLenCm,
  depthCm,
  stoneThicknessCm,
  cabTopY,
  localZShift,
  isLastSeg,
  isTransparent,
  matProps,
  sinkCutout,
  cooktopCutout,
}: {
  totalSegSlabLenCm: number;
  depthCm: number;
  stoneThicknessCm: number;
  cabTopY: number;
  localZShift: number;
  isLastSeg: boolean;
  isTransparent: boolean;
  matProps: any;
  sinkCutout?: { localX: number; width: number; depth: number } | null;
  cooktopCutout?: { localX: number; width: number; depth: number } | null;
}) {
  const geom = useMemo(() => {
    if (!sinkCutout && !cooktopCutout) return null;

    const shape = new THREE.Shape();
    const halfW = (totalSegSlabLenCm - (isLastSeg ? 0 : 0.05)) / 2;
    const halfD = depthCm / 2;

    shape.moveTo(-halfW, -halfD);
    shape.lineTo(halfW, -halfD);
    shape.lineTo(halfW, halfD);
    shape.lineTo(-halfW, halfD);
    shape.closePath();

    let hasValidHole = false;

    const addSafeHole = (cutout: { localX: number; width: number; depth: number }) => {
      const margin = 0.4;
      const hLeft = Math.max(-halfW + margin, cutout.localX - cutout.width / 2);
      const hRight = Math.min(halfW - margin, cutout.localX + cutout.width / 2);
      const hBack = Math.max(-halfD + margin, -cutout.depth / 2);
      const hFront = Math.min(halfD - margin, cutout.depth / 2);
      if (hRight - hLeft <= 1 || hFront - hBack <= 1) return;

      // Orientación horaria (opuesta al contorno antihorario) para triangulación robusta en Three.js
      const hole = new THREE.Path();
      hole.moveTo(hLeft, hBack);
      hole.lineTo(hLeft, hFront);
      hole.lineTo(hRight, hFront);
      hole.lineTo(hRight, hBack);
      hole.closePath();
      shape.holes.push(hole);
      hasValidHole = true;
    };

    if (sinkCutout) addSafeHole(sinkCutout);
    if (cooktopCutout) addSafeHole(cooktopCutout);

    if (!hasValidHole) return null;

    const g = new THREE.ExtrudeGeometry(shape, {
      depth: stoneThicknessCm,
      bevelEnabled: false,
    });
    g.rotateX(Math.PI / 2);
    g.translate(0, stoneThicknessCm, 0);
    g.computeVertexNormals();
    return g;
  }, [totalSegSlabLenCm, isLastSeg, depthCm, stoneThicknessCm, sinkCutout, cooktopCutout]);

  if (!geom) {
    return (
      <mesh
        position={[0, cabTopY + stoneThicknessCm / 2, localZShift]}
        castShadow={!isTransparent}
        receiveShadow={!isTransparent}
      >
        <boxGeometry args={[totalSegSlabLenCm - (isLastSeg ? 0 : 0.05), stoneThicknessCm, depthCm]} />
        <meshStandardMaterial {...matProps} />
        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
      </mesh>
    );
  }

  return (
    <mesh
      position={[0, cabTopY, localZShift]}
      geometry={geom}
      castShadow={!isTransparent}
      receiveShadow={!isTransparent}
    >
      <meshStandardMaterial {...matProps} />
      {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
    </mesh>
  );
}

// =========================================================================
// COMPONENTE PRINCIPAL: KITCHEN COUNTERTOP 3D (CONTINUOUS SLABS & UNDERMOUNT SINK)
// =========================================================================
export function KitchenCountertop3D() {
  const isTransparent = useStore((state) => state.isTransparent);
  const { countertopConfig, qstoneCatalog, cabinets, walls, architecturalElements, roomConfig } = useKitchenStore();

  const selectedProduct = useMemo(() => {
    return (
      qstoneCatalog.find((p) => p.id === countertopConfig.selectedProductId) ||
      qstoneCatalog[0]
    );
  }, [countertopConfig.selectedProductId, qstoneCatalog]);

  const stoneThicknessCm = selectedProduct.thicknessMm / 10; // 1.2, 1.8, 2.0 cm
  const regruesoCm = countertopConfig.regruesoCm; // 0 a 5 cm

  const stoneColor = selectedProduct.colorHex || '#F8FAFC';
  const roughness = selectedProduct.finish === 'Pulido Brillante' ? 0.08 : 0.25;
  const metalness = 0.04;

  const stoneTexture = useMemo(() => {
    if (!selectedProduct.textureUrl || selectedProduct.textureUrl.startsWith('#')) return null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const tex = loader.load(selectedProduct.textureUrl);
    tex.wrapS = THREE.MirroredRepeatWrapping;
    tex.wrapT = THREE.MirroredRepeatWrapping;
    tex.repeat.set(1.5, 1.5);
    return tex;
  }, [selectedProduct.textureUrl]);

  const getCountertopMatProps = () => ({
    color: isTransparent ? '#cbd5e1' : (stoneTexture ? '#ffffff' : stoneColor),
    map: isTransparent ? null : stoneTexture,
    roughness: isTransparent ? 0.1 : roughness,
    metalness: isTransparent ? 0.05 : metalness,
    transparent: isTransparent,
    opacity: isTransparent ? 0.3 : 1,
    depthWrite: !isTransparent,
  });

  // Agrupamiento geométrico en corridas continuas
  const continuousRuns = useMemo(() => {
    return detectContinuousCabinetRuns(cabinets, countertopConfig, walls, architecturalElements, roomConfig);
  }, [cabinets, countertopConfig, walls, architecturalElements, roomConfig]);

  // Si la cubierta NO está habilitada en el proyecto, renderizar ÚNICAMENTE la cubierta simulada semitransparente
  // de apoyo sobre los muebles con accesorios (lavaplatos o encimera) para que no floten en el aire y sea evidente
  // para el cliente que se trata de un preview simulado y no de una cubierta de fabricación incluida.
  if (!countertopConfig.enabled) {
    const accessoryCabinets = cabinets.filter((c) =>
      c.variant === 'base_sink_2_doors' ||
      c.variant === 'sink_2_doors' ||
      c.id === countertopConfig.sinkCabinetId ||
      c.variant === 'base_cooktop_3_drawers' ||
      c.variant === 'cooktop_3_drawers' ||
      c.id === countertopConfig.cooktopCabinetId
    );

    if (accessoryCabinets.length === 0) return null;

    return (
      <group name="kitchen-simulated-preview-countertops">
        {accessoryCabinets.map((cab) => {
          const isSink =
            cab.variant === 'base_sink_2_doors' ||
            cab.variant === 'sink_2_doors' ||
            cab.id === countertopConfig.sinkCabinetId;

          const isCooktop =
            cab.variant === 'base_cooktop_3_drawers' ||
            cab.variant === 'cooktop_3_drawers' ||
            cab.id === countertopConfig.cooktopCabinetId;

          const cabW = cab.width;
          const cabH = cab.height;
          const cabD = cab.depth || 60;
          const ctThick = 2.0;
          const cabTopY = (cab.position[1] || 0) + cabH / 2;
          const localZShift = 1.0;

          let cutoutW = 0;
          let cutoutD = 0;
          let sinkSpec: SinkSpec | null = null;
          let cooktopSpec: any = null;

          if (isSink) {
            const model = (countertopConfig.sinkModel && countertopConfig.sinkModel !== 'none')
              ? countertopConfig.sinkModel
              : 'alfa_onec_3018';
            sinkSpec = QSTONE_SINKS[model] || QSTONE_SINKS.alfa_onec_3018;
            cutoutW = sinkSpec.cutoutWidthMm / 10;
            cutoutD = sinkSpec.cutoutDepthMm / 10;
          } else if (isCooktop) {
            const model = (countertopConfig.cooktopModel && countertopConfig.cooktopModel !== 'none')
              ? countertopConfig.cooktopModel
              : 'fdv_design_60';
            cooktopSpec = FDV_COOKTOPS[model] || FDV_COOKTOPS.fdv_design_60;
            cutoutW = cooktopSpec.cutoutWidthMm / 10;
            cutoutD = cooktopSpec.cutoutDepthMm / 10;
          }

          const simMatProps = {
            color: '#cbd5e1',
            roughness: 0.2,
            metalness: 0.05,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
          };

          return (
            <group
              key={`preview-ct-${cab.id}`}
              position={[cab.position[0], cabTopY, cab.position[2]]}
              rotation={[0, cab.rotation || 0, 0]}
            >
              <SimulatedPreviewCountertopMesh
                cabW={cabW}
                cabD={cabD}
                ctThick={ctThick}
                cutoutW={cutoutW}
                cutoutD={cutoutD}
                simMatProps={simMatProps}
              />

              {/* Artefacto instalado apoyado sobre la cubierta simulada */}
              {isSink && sinkSpec && (
                <>
                  {countertopConfig.sinkModel === 'alfa_twoc_f5858a' ? (
                    <AlfaTwocF5858aRealistic
                      position={[0, ctThick, localZShift]}
                      stoneThicknessCm={ctThick}
                    />
                  ) : (
                    <AlfaOnec3018Realistic
                      position={[0, ctThick, localZShift]}
                      stoneThicknessCm={ctThick}
                    />
                  )}
                </>
              )}

              {isCooktop && (
                <group position={[0, ctThick, localZShift]}>
                  {countertopConfig.cooktopModel === 'fdv_design_90' ? (
                    <FdvDesign90Model position={[0, 0, 0]} />
                  ) : (
                    <FdvDesign60Model position={[0, 0, 0]} />
                  )}
                </group>
              )}
            </group>
          );
        })}
      </group>
    );
  }

  if (continuousRuns.length === 0) {
    return null;
  }

  return (
    <group name="kitchen-qstone-countertops">
      {continuousRuns.map((run, runIndex) => {
        const isIsland = run.type === 'island';
        const override = countertopConfig.runOverrides?.[run.id];
        const rot = run.rotation;
        const totalRunLengthCm = run.totalLengthMm / 10;
        const depthCm = run.depthMm / 10;
        const cabTopY = run.heightMm / 10;
        const slabCenterY = cabTopY + stoneThicknessCm / 2;

        const isHpl8mm = selectedProduct.thicknessMm === 8 || selectedProduct.materialType === 'hpl_abet';
        const rawRegruesoCm = override?.regruesoCm !== undefined
          ? override.regruesoCm
          : (isIsland
              ? (countertopConfig.islandRegruesoCm ?? countertopConfig.regruesoCm)
              : (countertopConfig.baseRegruesoCm ?? countertopConfig.regruesoCm));
        const regruesoCm = isHpl8mm ? 0 : rawRegruesoCm;

        const backsplashMode = override?.backsplashMode !== undefined
          ? override.backsplashMode
          : countertopConfig.backsplashMode;

        const backsplashHeightCm = override?.backsplashHeightCm !== undefined
          ? override.backsplashHeightCm
          : countertopConfig.backsplashHeightCm;

        const isWaterLeft = override?.waterfallLeft !== undefined
          ? override.waterfallLeft
          : (isIsland
              ? (countertopConfig.islandWaterfallLeft ?? countertopConfig.waterfallLeft)
              : (countertopConfig.baseWaterfallLeft ?? countertopConfig.waterfallLeft));

        const isWaterRight = override?.waterfallRight !== undefined
          ? override.waterfallRight
          : (isIsland
              ? (countertopConfig.islandWaterfallRight ?? countertopConfig.waterfallRight)
              : (countertopConfig.baseWaterfallRight ?? countertopConfig.waterfallRight));

        const frontOverhang = (run.overhangFrontMm ?? (countertopConfig.overhangFrontCm ? countertopConfig.overhangFrontCm * 10 : 20)) / 10;
        const rearOverhang = (run.overhangRearMm ?? (isIsland ? (countertopConfig.overhangBackCm ?? countertopConfig.islandOverhangCm ?? 30) * 10 : 0)) / 10;
        const localZShift = (frontOverhang - rearOverhang) / 2;

        // Verificar si la corrida contiene el lavaplatos o la encimera
        const sinkCabinet = run.cabinets.find(
          (c) => c.id === countertopConfig.sinkCabinetId ||
                 c.variant === 'base_sink_2_doors' ||
                 c.variant === 'sink_2_doors'
        );
        const cooktopCabinet = run.cabinets.find(
          (c) => c.id === countertopConfig.cooktopCabinetId ||
                 c.variant === 'base_cooktop_3_drawers' ||
                 c.variant === 'cooktop_3_drawers'
        );

        // Proyección real de posición mundial sobre el eje local +X de la corrida (evita desfases por micro-gaps)
        const uRunX = Math.cos(rot);
        const uRunZ = -Math.sin(rot);
        const projectCabCenterRelX = (cab: CabinetType) =>
          (cab.position[0] - run.centerWorld[0]) * uRunX +
          (cab.position[2] - run.centerWorld[2]) * uRunZ;

        // Calcular posición relativa del lavaplatos dentro de la corrida
        let sinkRelX: number | null = null;
        let sinkSpec: SinkSpec | null = null;
        if (sinkCabinet) {
          const model = (countertopConfig.sinkModel && countertopConfig.sinkModel !== 'none')
            ? countertopConfig.sinkModel
            : 'alfa_onec_3018';
          sinkSpec = QSTONE_SINKS[model] || QSTONE_SINKS.alfa_onec_3018;
          sinkRelX = projectCabCenterRelX(sinkCabinet);
        }

        // Posición relativa de la encimera dentro de la corrida
        let cooktopRelX: number | null = null;
        let cooktopSpec: any = null;
        if (cooktopCabinet) {
          const model = (countertopConfig.cooktopModel && countertopConfig.cooktopModel !== 'none')
            ? countertopConfig.cooktopModel
            : 'fdv_design_60';
          cooktopSpec = FDV_COOKTOPS[model] || FDV_COOKTOPS.fdv_design_60;
          cooktopRelX = projectCabCenterRelX(cooktopCabinet);
        }

        // Renderizar los tramos de la corrida según segmentLengthsMm
        let currentSegStartCm = -totalRunLengthCm / 2;
        const totalExtLeftCm =
          ((run.cornerExtensionLeftMm || 0) + (run.extensionToWallLeftMm || 0) + (run.overhangLeftMm || 0)) / 10;
        const totalExtRightCm =
          ((run.cornerExtensionRightMm || 0) + (run.extensionToWallRightMm || 0) + (run.overhangRightMm || 0)) / 10;
        const trimLeftCm = (run.cornerTrimLeftMm || 0) / 10;
        const trimRightCm = (run.cornerTrimRightMm || 0) / 10;

        const bsExtLeftCm =
          ((run.backsplashExtLeftMm || 0) + (run.extensionToWallLeftMm || 0) + (run.overhangLeftMm || 0)) / 10;
        const bsExtRightCm =
          ((run.backsplashExtRightMm || 0) + (run.extensionToWallRightMm || 0) + (run.overhangRightMm || 0)) / 10;

        return (
          <group
            key={`run-${run.id}-${runIndex}`}
            position={[run.centerWorld[0], 0, run.centerWorld[2]]}
            rotation={[0, rot, 0]}
          >
            {run.segmentLengthsMm.map((segLenMm, segIdx) => {
              const segLenCm = segLenMm / 10;
              const extraCornerLeftCm = segIdx === 0 ? (totalExtLeftCm - trimLeftCm) : 0;
              const extraCornerRightCm =
                segIdx === run.segmentLengthsMm.length - 1 ? (totalExtRightCm - trimRightCm) : 0;
              const totalSegSlabLenCm = Math.max(0.1, segLenCm + extraCornerLeftCm + extraCornerRightCm);
              const segCornerShiftX = (extraCornerRightCm - extraCornerLeftCm) / 2;

              const segCenterRelX = currentSegStartCm + segLenCm / 2 + segCornerShiftX;
              const segLeft = currentSegStartCm - extraCornerLeftCm;
              const segRight = currentSegStartCm + segLenCm + extraCornerRightCm;
              currentSegStartCm += segLenCm;

              const isLastSeg = segIdx === run.segmentLengthsMm.length - 1;

              // Comprobar si el calado del lavaplatos o encimera intersecta este tramo (y en cuál va el modelo 3D)
              const sinkHalfW = sinkSpec ? sinkSpec.cutoutWidthMm / 20 : 0;
              const cooktopHalfW = cooktopSpec ? cooktopSpec.cutoutWidthMm / 20 : 0;

              const hasSinkCutoutInSeg =
                sinkRelX !== null &&
                sinkSpec !== null &&
                sinkRelX + sinkHalfW > segLeft + 0.5 &&
                sinkRelX - sinkHalfW < segRight - 0.5;

              const renderSinkModelInSeg =
                sinkRelX !== null &&
                sinkSpec !== null &&
                sinkRelX >= segLeft - 0.01 &&
                (isLastSeg ? sinkRelX <= segRight + 0.01 : sinkRelX < segRight);

              const hasCooktopCutoutInSeg =
                cooktopRelX !== null &&
                cooktopSpec !== null &&
                cooktopRelX + cooktopHalfW > segLeft + 0.5 &&
                cooktopRelX - cooktopHalfW < segRight - 0.5;

              const renderCooktopModelInSeg =
                cooktopRelX !== null &&
                cooktopSpec !== null &&
                cooktopRelX >= segLeft - 0.01 &&
                (isLastSeg ? cooktopRelX <= segRight + 0.01 : cooktopRelX < segRight);

              const sinkCutout = (hasSinkCutoutInSeg && sinkSpec) ? {
                localX: sinkRelX! - segCenterRelX,
                width: sinkSpec.cutoutWidthMm / 10,
                depth: sinkSpec.cutoutDepthMm / 10,
              } : null;

              const cooktopCutout = (hasCooktopCutoutInSeg && cooktopSpec) ? {
                localX: cooktopRelX! - segCenterRelX,
                width: cooktopSpec.cutoutWidthMm / 10,
                depth: cooktopSpec.cutoutDepthMm / 10,
              } : null;

              return (
                <group key={`seg-${segIdx}`} position={[segCenterRelX, 0, 0]}>
                  {/* Plancha de cubierta continua monolítica (con o sin calados CNC) */}
                  <ContinuousSlabSegmentMesh
                    totalSegSlabLenCm={totalSegSlabLenCm}
                    depthCm={depthCm}
                    stoneThicknessCm={stoneThicknessCm}
                    cabTopY={cabTopY}
                    localZShift={localZShift}
                    isLastSeg={isLastSeg}
                    isTransparent={isTransparent}
                    matProps={getCountertopMatProps()}
                    sinkCutout={sinkCutout}
                    cooktopCutout={cooktopCutout}
                  />

                  {/* MONTAJE BAJO CUBIERTA DEL LAVAPLATOS REALISTA */}
                  {renderSinkModelInSeg && sinkCutout && (
                    <>
                      {countertopConfig.sinkModel === 'alfa_twoc_f5858a' ? (
                        <AlfaTwocF5858aRealistic
                          position={[sinkCutout.localX, cabTopY + stoneThicknessCm, localZShift]}
                          stoneThicknessCm={stoneThicknessCm}
                        />
                      ) : (
                        <AlfaOnec3018Realistic
                          position={[sinkCutout.localX, cabTopY + stoneThicknessCm, localZShift]}
                          stoneThicknessCm={stoneThicknessCm}
                        />
                      )}
                    </>
                  )}

                  {/* ENCIMERA A GAS FDV ENCASTRADA EN EL CALADO */}
                  {renderCooktopModelInSeg && cooktopCutout && (
                    <group position={[cooktopCutout.localX, cabTopY + stoneThicknessCm, localZShift]}>
                      {countertopConfig.cooktopModel === 'fdv_design_90' ? (
                        <FdvDesign90Model position={[0, 0, 0]} />
                      ) : (
                        <FdvDesign60Model position={[0, 0, 0]} />
                      )}
                    </group>
                  )}

                  {/* Junta sutil a 90° si el tramo fue seccionado por criterio de transporte */}
                  {!isLastSeg && (
                    <mesh position={[totalSegSlabLenCm / 2, slabCenterY, localZShift]}>
                      <boxGeometry args={[0.06, stoneThicknessCm + 0.02, depthCm + 0.02]} />
                      <meshStandardMaterial
                        key={isTransparent ? 'transp' : 'solid'}
                        color={isTransparent ? '#cbd5e1' : '#94a3b8'}
                        roughness={isTransparent ? 0.1 : 0.8}
                        transparent={isTransparent}
                        opacity={isTransparent ? 0.3 : 1}
                        depthWrite={!isTransparent}
                      />
                    </mesh>
                  )}
                </group>
              );
            })}

            {/* Faldón Delantero / Regrueso Continuo (de 0 a 5 cm) */}
            {regruesoCm > 0 && (() => {
              const apronShiftX =
                (totalExtRightCm - trimRightCm - (totalExtLeftCm - trimLeftCm)) / 2;
              const apronLen = Math.max(
                0.1,
                totalRunLengthCm + (totalExtLeftCm - trimLeftCm) + (totalExtRightCm - trimRightCm)
              );
              const isWaterLeft = isIsland
                ? (countertopConfig.islandWaterfallLeft ?? countertopConfig.waterfallLeft)
                : (countertopConfig.baseWaterfallLeft ?? countertopConfig.waterfallLeft);
              const isWaterRight = isIsland
                ? (countertopConfig.islandWaterfallRight ?? countertopConfig.waterfallRight)
                : (countertopConfig.baseWaterfallRight ?? countertopConfig.waterfallRight);

              return (
                <group>
                  {/* Faldón frontal */}
                  <mesh
                    position={[
                      apronShiftX,
                      cabTopY + stoneThicknessCm - regruesoCm / 2,
                      run.cabinets[0].depth / 2 + frontOverhang - stoneThicknessCm / 2,
                    ]}
                    castShadow={!isTransparent}
                    receiveShadow={!isTransparent}
                  >
                    <boxGeometry args={[apronLen, regruesoCm, stoneThicknessCm]} />
                    <meshStandardMaterial {...getCountertopMatProps()} />
                    {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
                  </mesh>

                  {/* Faldón lateral izquierdo si no hay cascada y el extremo está libre */}
                  {countertopConfig.regruesoOnOverhangSides !== false &&
                    !isWaterLeft &&
                    run.canWaterfallLeft &&
                    run.cornerExtensionLeftMm === 0 &&
                    (run.extensionToWallLeftMm || 0) === 0 && (
                      <mesh
                        position={[
                          -totalRunLengthCm / 2 - (totalExtLeftCm - trimLeftCm) + stoneThicknessCm / 2,
                          cabTopY + stoneThicknessCm - regruesoCm / 2,
                          localZShift,
                        ]}
                        castShadow={!isTransparent}
                        receiveShadow={!isTransparent}
                      >
                        <boxGeometry args={[stoneThicknessCm, regruesoCm, depthCm]} />
                        <meshStandardMaterial {...getCountertopMatProps()} />
                        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
                      </mesh>
                    )}

                  {/* Faldón lateral derecho si no hay cascada y el extremo está libre */}
                  {countertopConfig.regruesoOnOverhangSides !== false &&
                    !isWaterRight &&
                    run.canWaterfallRight &&
                    run.cornerExtensionRightMm === 0 &&
                    (run.extensionToWallRightMm || 0) === 0 && (
                      <mesh
                        position={[
                          totalRunLengthCm / 2 + (totalExtRightCm - trimRightCm) - stoneThicknessCm / 2,
                          cabTopY + stoneThicknessCm - regruesoCm / 2,
                          localZShift,
                        ]}
                        castShadow={!isTransparent}
                        receiveShadow={!isTransparent}
                      >
                        <boxGeometry args={[stoneThicknessCm, regruesoCm, depthCm]} />
                        <meshStandardMaterial {...getCountertopMatProps()} />
                        {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
                      </mesh>
                    )}

                  {/* Faldón posterior en isla (barra volada engrosada perimetralmente) */}
                  {isIsland && rearOverhang > 0 && countertopConfig.regruesoOnOverhangSides !== false && (
                    <mesh
                      position={[
                        apronShiftX,
                        cabTopY + stoneThicknessCm - regruesoCm / 2,
                        -run.cabinets[0].depth / 2 - rearOverhang + stoneThicknessCm / 2,
                      ]}
                      castShadow={!isTransparent}
                      receiveShadow={!isTransparent}
                    >
                      <boxGeometry args={[apronLen, regruesoCm, stoneThicknessCm]} />
                      <meshStandardMaterial {...getCountertopMatProps()} />
                      {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
                    </mesh>
                  )}
                </group>
              );
            })()}

            {/* Respaldo / Zócalo Posterior Continuo (solo en muebles base contra muro, abarca 100% largo de la cubierta y patas) */}
            {!isIsland && backsplashMode !== 'none' && (() => {
              const waterLeftExtCm = isWaterLeft && run.canWaterfallLeft ? stoneThicknessCm : 0;
              const waterRightExtCm = isWaterRight && run.canWaterfallRight ? stoneThicknessCm : 0;

              const effectiveExtLeftCm = bsExtLeftCm + waterLeftExtCm;
              const effectiveExtRightCm = bsExtRightCm + waterRightExtCm;

              const bsLenCm = Math.max(0.1, totalRunLengthCm + effectiveExtLeftCm + effectiveExtRightCm);
              const bsCenterShiftX = (effectiveExtRightCm - effectiveExtLeftCm) / 2;

              return (
                <mesh
                  position={[
                    bsCenterShiftX,
                    cabTopY +
                      stoneThicknessCm +
                      (backsplashMode === 'standard_5cm' ? backsplashHeightCm / 2 : 27.5),
                    -run.cabinets[0].depth / 2 + stoneThicknessCm / 2,
                  ]}
                  castShadow={!isTransparent}
                  receiveShadow={!isTransparent}
                >
                  <boxGeometry
                    args={[
                      bsLenCm,
                      backsplashMode === 'standard_5cm' ? backsplashHeightCm : 55,
                      stoneThicknessCm,
                    ]}
                  />
                  <meshStandardMaterial {...getCountertopMatProps()} />
                  {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
                </mesh>
              );
            })()}

            {/* Remate Lateral Cascada (Waterfall) Izquierda - Solo si el extremo está libre (sin despensa ni esquina) */}
            {(() => {
              if (!isWaterLeft || !run.canWaterfallLeft) return null;
              return (
                <mesh
                  position={[
                    -totalRunLengthCm / 2 - stoneThicknessCm / 2,
                    (cabTopY + stoneThicknessCm) / 2,
                    localZShift,
                  ]}
                  castShadow={!isTransparent}
                  receiveShadow={!isTransparent}
                >
                  <boxGeometry
                    args={[stoneThicknessCm, cabTopY + stoneThicknessCm, depthCm]}
                  />
                  <meshStandardMaterial {...getCountertopMatProps()} />
                  {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
                </mesh>
              );
            })()}

            {/* Remate Lateral Cascada (Waterfall) Derecha - Solo si el extremo está libre (sin despensa ni esquina) */}
            {(() => {
              if (!isWaterRight || !run.canWaterfallRight) return null;
              return (
                <mesh
                  position={[
                    totalRunLengthCm / 2 + stoneThicknessCm / 2,
                    (cabTopY + stoneThicknessCm) / 2,
                    localZShift,
                  ]}
                  castShadow={!isTransparent}
                  receiveShadow={!isTransparent}
                >
                  <boxGeometry
                    args={[stoneThicknessCm, cabTopY + stoneThicknessCm, depthCm]}
                  />
                  <meshStandardMaterial {...getCountertopMatProps()} />
                  {isTransparent && <Edges scale={1} threshold={15} color="#555555" />}
                </mesh>
              );
            })()}
          </group>
        );
      })}
    </group>
  );
}
