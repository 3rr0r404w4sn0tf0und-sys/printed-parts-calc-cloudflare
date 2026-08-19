"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Fake 3D print bed. Three interaction modes, switched via toolbar buttons:
 *  - Rotate (default): drag the part to spin it in place. Drag empty space
 *    to orbit the camera (OrbitControls).
 *  - Move: drag the part to slide it around the bed plate (X/Z only,
 *    raycast against the y=0 plane so it tracks the cursor exactly).
 *    Position is clamped to stay within the printer's bed dims.
 *  - Flip to face: click a triangle on the part and it reorients so that
 *    face points straight down (classic slicer "place on face").
 *
 * After any rotation OR move, dropToBed() re-settles the part so its
 * lowest point sits exactly at y=0 -- this is what stops it clipping
 * through or floating above the grid on odd orientations. It intentionally
 * only corrects Y; X/Z position is left alone so Move mode placement
 * persists across subsequent rotations/flips.
 */
export default function BedViewer({ meshUrl, bedDims, onRotatedDimsChange }) {
  const containerRef = useRef(null);
  const stateRef = useRef({});
  const modeRef = useRef("rotate");
  const bedDimsRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const [mode, setMode] = useState("rotate"); // "rotate" | "move" | "flip"

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    bedDimsRef.current = bedDims || null;
  }, [bedDims]);

  // Set up scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = 360;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14161c);

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    camera.position.set(220, 220, 220);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(150, 300, 150);
    scene.add(dir);

    const partGroup = new THREE.Group();
    scene.add(partGroup);

    let raf;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    // Corrects Y only, so the part's lowest point sits at the plate.
    // X/Z are left untouched so a Move-mode placement survives a
    // subsequent rotation or face-flip instead of snapping back to center.
    function dropToBed() {
      const box = new THREE.Box3().setFromObject(partGroup);
      if (!isFinite(box.min.y)) return; // nothing loaded yet
      partGroup.position.y -= box.min.y;
    }

    function reportRotation() {
      dropToBed();
      const r = partGroup.rotation;
      setRotation({
        x: THREE.MathUtils.radToDeg(r.x) % 360,
        y: THREE.MathUtils.radToDeg(r.y) % 360,
        z: THREE.MathUtils.radToDeg(r.z) % 360,
      });
      const box = new THREE.Box3().setFromObject(partGroup);
      const size = new THREE.Vector3();
      box.getSize(size);
      onRotatedDimsChange?.({ x: size.x, y: size.y, z: size.z });
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const planeHit = new THREE.Vector3();

    let dragKind = null; // "rotate" | "move" | null
    let lastX = 0, lastY = 0;
    let moveGrabOffset = { x: 0, z: 0 };

    function setPointerFromEvent(e, rect) {
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function clampToBed() {
      const dims = bedDimsRef.current;
      if (!dims) return;
      const halfX = dims.x / 2;
      const halfZ = dims.y / 2;
      partGroup.position.x = THREE.MathUtils.clamp(partGroup.position.x, -halfX, halfX);
      partGroup.position.z = THREE.MathUtils.clamp(partGroup.position.z, -halfZ, halfZ);
    }

    function onPointerDown(e) {
      const currentMode = modeRef.current;
      if (currentMode === "flip") return; // handled by onClick

      const rect = renderer.domElement.getBoundingClientRect();
      setPointerFromEvent(e, rect);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(partGroup, true);
      if (hits.length === 0) return;

      controls.enabled = false;
      lastX = e.clientX;
      lastY = e.clientY;

      if (currentMode === "move") {
        dragKind = "move";
        if (raycaster.ray.intersectPlane(groundPlane, planeHit)) {
          moveGrabOffset = { x: planeHit.x - partGroup.position.x, z: planeHit.z - partGroup.position.z };
        }
      } else {
        dragKind = "rotate";
      }
    }

    function onPointerMove(e) {
      if (!dragKind) return;
      const rect = renderer.domElement.getBoundingClientRect();

      if (dragKind === "move") {
        setPointerFromEvent(e, rect);
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(groundPlane, planeHit)) {
          partGroup.position.x = planeHit.x - moveGrabOffset.x;
          partGroup.position.z = planeHit.z - moveGrabOffset.z;
          clampToBed();
        }
      } else {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        partGroup.rotation.y += dx * 0.01;
        partGroup.rotation.x += dy * 0.01;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      reportRotation();
    }

    function onPointerUp() {
      dragKind = null;
      controls.enabled = true;
    }

    // Slicer-style "place on face": while armed, the next click on a
    // triangle reorients the part so that face's normal points straight
    // down, then drops it back onto the plate.
    function onClick(e) {
      if (modeRef.current !== "flip") return;
      const rect = renderer.domElement.getBoundingClientRect();
      setPointerFromEvent(e, rect);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(partGroup, true);
      const hit = hits[0];
      if (!hit || !hit.face) return;

      const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
      const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      const down = new THREE.Vector3(0, -1, 0);
      const alignQuat = new THREE.Quaternion().setFromUnitVectors(worldNormal, down);

      partGroup.quaternion.premultiply(alignQuat);
      reportRotation();
      modeRef.current = "rotate";
      setMode("rotate");
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("click", onClick);

    stateRef.current = { scene, camera, renderer, controls, partGroup, reportRotation, dropToBed };

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // Rebuild the bed grid when printer bed dims change
  useEffect(() => {
    const { scene } = stateRef.current;
    if (!scene || !bedDims) return;

    const existing = scene.getObjectByName("bed");
    if (existing) scene.remove(existing);

    const bedGroup = new THREE.Group();
    bedGroup.name = "bed";

    const grid = new THREE.GridHelper(Math.max(bedDims.x, bedDims.y), 20, 0x4f8cff, 0x2a2d34);
    bedGroup.add(grid);

    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(bedDims.x, bedDims.y),
      new THREE.MeshBasicMaterial({ color: 0x1c1f28, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = -0.1;
    bedGroup.add(plate);

    scene.add(bedGroup);
  }, [bedDims]);

  // Load mesh when meshUrl changes
  useEffect(() => {
    const { scene, partGroup, camera, controls, reportRotation } = stateRef.current;
    if (!scene || !partGroup || !meshUrl) return;

    setLoading(true);
    setError(null);
    setMode("rotate");

    fetch(meshUrl)
      .then((r) => r.json())
      .then(({ positions, indices }) => {
        // Clear previous part
        while (partGroup.children.length) partGroup.remove(partGroup.children[0]);
        partGroup.rotation.set(0, 0, 0);
        partGroup.position.set(0, 0, 0);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        // Center part on bed and sit it on the plate (bottom at y=0).
        // CAD Z becomes viewer Y (up); rotate coordinate frame accordingly.
        geometry.rotateX(-Math.PI / 2);
        geometry.computeBoundingBox();
        const bb = geometry.boundingBox;
        const center = new THREE.Vector3();
        bb.getCenter(center);
        geometry.translate(-center.x, -bb.min.y, -center.z);

        const material = new THREE.MeshStandardMaterial({ color: 0x7c8cff, roughness: 0.55 });
        const mesh = new THREE.Mesh(geometry, material);
        partGroup.add(mesh);

        // Frame camera on the part
        geometry.computeBoundingSphere();
        const radius = geometry.boundingSphere.radius || 50;
        camera.position.set(radius * 2.2, radius * 2.2, radius * 2.2);
        controls.target.set(0, radius * 0.3, 0);
        controls.update();

        reportRotation();
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [meshUrl]);

  function resetPlacement() {
    const { partGroup, reportRotation } = stateRef.current;
    if (!partGroup) return;
    partGroup.rotation.set(0, 0, 0);
    partGroup.position.set(0, 0, 0);
    reportRotation();
  }

  function nudge(axis, deg) {
    const { partGroup, reportRotation } = stateRef.current;
    if (!partGroup) return;
    partGroup.rotation[axis] += THREE.MathUtils.degToRad(deg);
    reportRotation();
  }

  function setModeAndSync(next) {
    setMode((current) => (current === next ? "rotate" : next));
  }

  const hint =
    mode === "flip"
      ? "Click a face on the part below."
      : mode === "move"
      ? "Drag the part to slide it around the bed."
      : "Drag the part to rotate. Drag empty space to orbit camera.";

  return (
    <div>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: 360,
          borderRadius: 8,
          overflow: "hidden",
          position: "relative",
          cursor: mode === "flip" ? "crosshair" : mode === "move" ? "move" : undefined,
        }}
      >
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#9aa0ab", fontSize: 13 }}>
            Loading part…
          </div>
        )}
        {mode !== "rotate" && !loading && (
          <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(20,22,28,0.85)", color: "#7c8cff", fontSize: 11, padding: "3px 8px", borderRadius: 4, pointerEvents: "none" }}>
            {mode === "flip" ? "Click a face to place it flat on the bed" : "Drag the part to move it"}
          </div>
        )}
      </div>
      {error && <div style={{ color: "#e08080", fontSize: 12, marginTop: 4 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "#9aa0ab" }}>{hint}</span>

        <button
          onClick={() => setModeAndSync("move")}
          style={{ fontSize: 11, padding: "2px 8px", background: mode === "move" ? "#4f5cff" : undefined, color: mode === "move" ? "#fff" : undefined }}
        >
          Move
        </button>
        <button
          onClick={() => setModeAndSync("flip")}
          style={{ fontSize: 11, padding: "2px 8px", background: mode === "flip" ? "#4f5cff" : undefined, color: mode === "flip" ? "#fff" : undefined }}
        >
          Flip to face
        </button>
        <button onClick={resetPlacement} style={{ fontSize: 11, padding: "2px 8px" }}>Reset</button>
        {["x", "y", "z"].map((axis) => (
          <span key={axis} style={{ fontSize: 11, color: "#9aa0ab" }}>
            {axis.toUpperCase()}: {rotation[axis].toFixed(0)}°
            <button onClick={() => nudge(axis, 90)} style={{ fontSize: 10, marginLeft: 4, padding: "1px 5px" }}>+90°</button>
          </span>
        ))}
      </div>
    </div>
  );
}
