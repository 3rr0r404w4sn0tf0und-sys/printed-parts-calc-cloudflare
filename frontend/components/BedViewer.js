"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Fake 3D print bed. Supports multiple copies of the loaded part, each
 * independently selectable, movable, rotatable, and flippable.
 *
 * Interaction:
 *  - Click a part to select it. Click empty space to deselect.
 *  - Rotate mode (default): drag the selected part to spin it. Drag empty
 *    space to orbit the camera.
 *  - Move mode: drag the part along the bed plate (raycast against the
 *    y=0 plane so it tracks the cursor exactly). Clamped to bed dims.
 *  - Flip to face: click a triangle and that face is oriented straight
 *    down (classic slicer "place on face").
 *  - Ctrl/Cmd+C / Ctrl/Cmd+V: copy and paste (duplicate) the selected part.
 *  - Ctrl/Cmd+Z / Ctrl/Cmd+Y (or Shift+Z): undo / redo. Covers moves,
 *    rotations, flips, resets, copies, and deletes.
 *  - Delete / Backspace: remove the selected part (won't delete the last
 *    remaining one).
 *
 * After any transform, dropToBedGroup() re-settles that instance so its
 * lowest point sits at y=0 -- stops parts clipping through or floating
 * above the grid on odd orientations. It only corrects Y; X/Z is left
 * alone so Move-mode placement survives later rotations/flips.
 */
export default function BedViewer({ meshUrl, bedDims, onRotatedDimsChange }) {
  const containerRef = useRef(null);
  const stateRef = useRef({});
  const modeRef = useRef("rotate");
  const bedDimsRef = useRef(null);
  const selectedIdRef = useRef(null);
  const instancesRef = useRef(new Map()); // id -> { group, mesh }
  const sharedGeometryRef = useRef(null);
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const clipboardRef = useRef(null);
  const nextIdRef = useRef(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const [mode, setMode] = useState("rotate"); // "rotate" | "move" | "flip"
  const [selectedId, setSelectedId] = useState(null);
  const [partCount, setPartCount] = useState(0);
  const [uiFlags, setUiFlags] = useState({ canUndo: false, canRedo: false, hasClipboard: false });

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { bedDimsRef.current = bedDims || null; }, [bedDims]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Highlight the selected instance
  useEffect(() => {
    instancesRef.current.forEach(({ mesh }, id) => {
      mesh.material.emissive.setHex(id === selectedId ? 0x2a3550 : 0x000000);
    });
  }, [selectedId, partCount]);

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

    const assemblyGroup = new THREE.Group();
    scene.add(assemblyGroup);

    let raf;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    function createInstance(id, transform) {
      const material = new THREE.MeshStandardMaterial({ color: 0x7c8cff, roughness: 0.55 });
      const mesh = new THREE.Mesh(sharedGeometryRef.current, material);
      mesh.userData.id = id;
      const group = new THREE.Group();
      group.userData.id = id;
      group.add(mesh);
      if (transform?.position) group.position.copy(transform.position);
      if (transform?.quaternion) group.quaternion.copy(transform.quaternion);
      assemblyGroup.add(group);
      return { group, mesh };
    }

    function dropToBedGroup(group) {
      const box = new THREE.Box3().setFromObject(group);
      if (!isFinite(box.min.y)) return;
      group.position.y -= box.min.y;
    }

    function clampGroupToBed(group) {
      const dims = bedDimsRef.current;
      if (!dims) return;
      group.position.x = THREE.MathUtils.clamp(group.position.x, -dims.x / 2, dims.x / 2);
      group.position.z = THREE.MathUtils.clamp(group.position.z, -dims.y / 2, dims.y / 2);
    }

    function reportSelectedTransform() {
      const id = selectedIdRef.current;
      const inst = id != null ? instancesRef.current.get(id) : null;
      if (!inst) return;
      const r = inst.group.rotation;
      setRotation({
        x: THREE.MathUtils.radToDeg(r.x) % 360,
        y: THREE.MathUtils.radToDeg(r.y) % 360,
        z: THREE.MathUtils.radToDeg(r.z) % 360,
      });
      const box = new THREE.Box3().setFromObject(inst.group);
      const size = new THREE.Vector3();
      box.getSize(size);
      onRotatedDimsChange?.({ x: size.x, y: size.y, z: size.z });
    }

    function syncUiFlags() {
      setUiFlags({
        canUndo: historyIndexRef.current > 0,
        canRedo: historyIndexRef.current < historyRef.current.length - 1,
        hasClipboard: clipboardRef.current != null,
      });
    }

    function pushHistory() {
      const snapshot = {
        selectedId: selectedIdRef.current,
        ids: Array.from(instancesRef.current.entries()).map(([id, { group }]) => ({
          id,
          position: { x: group.position.x, y: group.position.y, z: group.position.z },
          quaternion: { x: group.quaternion.x, y: group.quaternion.y, z: group.quaternion.z, w: group.quaternion.w },
        })),
      };
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
      historyRef.current.push(snapshot);
      historyIndexRef.current = historyRef.current.length - 1;
      syncUiFlags();
    }

    function restoreSnapshot(snapshot) {
      const keepIds = new Set(snapshot.ids.map((s) => s.id));
      for (const [id, { group }] of instancesRef.current) {
        if (!keepIds.has(id)) {
          assemblyGroup.remove(group);
          instancesRef.current.delete(id);
        }
      }
      snapshot.ids.forEach((s) => {
        let inst = instancesRef.current.get(s.id);
        if (!inst) {
          inst = createInstance(s.id);
          instancesRef.current.set(s.id, inst);
        }
        inst.group.position.set(s.position.x, s.position.y, s.position.z);
        inst.group.quaternion.set(s.quaternion.x, s.quaternion.y, s.quaternion.z, s.quaternion.w);
      });
      setPartCount(instancesRef.current.size);
      selectedIdRef.current = snapshot.selectedId;
      setSelectedId(snapshot.selectedId);
      reportSelectedTransform();
    }

    function undo() {
      if (historyIndexRef.current <= 0) return;
      historyIndexRef.current -= 1;
      restoreSnapshot(historyRef.current[historyIndexRef.current]);
      syncUiFlags();
    }

    function redo() {
      if (historyIndexRef.current >= historyRef.current.length - 1) return;
      historyIndexRef.current += 1;
      restoreSnapshot(historyRef.current[historyIndexRef.current]);
      syncUiFlags();
    }

    function copySelected() {
      const id = selectedIdRef.current;
      const inst = id != null ? instancesRef.current.get(id) : null;
      if (!inst) return;
      clipboardRef.current = { position: inst.group.position.clone(), quaternion: inst.group.quaternion.clone() };
      syncUiFlags();
    }

    function pasteClipboard() {
      if (!clipboardRef.current || !sharedGeometryRef.current) return;
      const id = nextIdRef.current++;
      const pos = clipboardRef.current.position.clone();
      pos.x += 15;
      pos.z += 15;
      const inst = createInstance(id, { position: pos, quaternion: clipboardRef.current.quaternion.clone() });
      instancesRef.current.set(id, inst);
      clampGroupToBed(inst.group);
      dropToBedGroup(inst.group);
      clipboardRef.current = { position: inst.group.position.clone(), quaternion: inst.group.quaternion.clone() };
      setPartCount(instancesRef.current.size);
      selectedIdRef.current = id;
      setSelectedId(id);
      reportSelectedTransform();
      pushHistory();
    }

    function deleteSelected() {
      const id = selectedIdRef.current;
      if (id == null || instancesRef.current.size <= 1) return;
      const inst = instancesRef.current.get(id);
      if (!inst) return;
      assemblyGroup.remove(inst.group);
      instancesRef.current.delete(id);
      setPartCount(instancesRef.current.size);
      const remaining = Array.from(instancesRef.current.keys());
      const newSel = remaining[remaining.length - 1] ?? null;
      selectedIdRef.current = newSel;
      setSelectedId(newSel);
      reportSelectedTransform();
      pushHistory();
    }

    function nudge(axis, deg) {
      const id = selectedIdRef.current;
      const inst = id != null ? instancesRef.current.get(id) : null;
      if (!inst) return;
      inst.group.rotation[axis] += THREE.MathUtils.degToRad(deg);
      dropToBedGroup(inst.group);
      reportSelectedTransform();
      pushHistory();
    }

    function resetPlacement() {
      const id = selectedIdRef.current;
      const inst = id != null ? instancesRef.current.get(id) : null;
      if (!inst) return;
      inst.group.rotation.set(0, 0, 0);
      inst.group.position.set(0, 0, 0);
      dropToBedGroup(inst.group);
      reportSelectedTransform();
      pushHistory();
    }

    // --- pointer interaction ---
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const planeHit = new THREE.Vector3();

    let dragKind = null; // { type: "rotate" | "move", id } | null
    let downPos = { x: 0, y: 0 };
    let lastX = 0, lastY = 0;
    let moveGrabOffset = { x: 0, z: 0 };

    function setPointerFromEvent(e, rect) {
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function raycastInstances(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      setPointerFromEvent(e, rect);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObject(assemblyGroup, true);
    }

    function onPointerDown(e) {
      downPos = { x: e.clientX, y: e.clientY };
      const currentMode = modeRef.current;
      const hits = raycastInstances(e);
      const hit = hits[0];
      if (!hit) { dragKind = null; return; }
      if (currentMode === "flip") { dragKind = null; return; } // resolved on pointerup

      const id = hit.object.userData.id;
      selectedIdRef.current = id;
      setSelectedId(id);
      const inst = instancesRef.current.get(id);
      controls.enabled = false;
      lastX = e.clientX;
      lastY = e.clientY;

      if (currentMode === "move") {
        dragKind = { type: "move", id };
        if (raycaster.ray.intersectPlane(groundPlane, planeHit)) {
          moveGrabOffset = { x: planeHit.x - inst.group.position.x, z: planeHit.z - inst.group.position.z };
        }
      } else {
        dragKind = { type: "rotate", id };
      }
    }

    function onPointerMove(e) {
      if (!dragKind) return;
      const inst = instancesRef.current.get(dragKind.id);
      if (!inst) return;

      if (dragKind.type === "move") {
        const rect = renderer.domElement.getBoundingClientRect();
        setPointerFromEvent(e, rect);
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(groundPlane, planeHit)) {
          inst.group.position.x = planeHit.x - moveGrabOffset.x;
          inst.group.position.z = planeHit.z - moveGrabOffset.z;
          clampGroupToBed(inst.group);
        }
      } else {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        inst.group.rotation.y += dx * 0.01;
        inst.group.rotation.x += dy * 0.01;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      dropToBedGroup(inst.group);
      reportSelectedTransform();
    }

    function onPointerUp(e) {
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 4;
      const wasDragging = !!dragKind;
      if (wasDragging) {
        dragKind = null;
        controls.enabled = true;
        if (moved) pushHistory();
      }
      if (moved) return;

      // Genuine click/tap (no meaningful drag) -- select, deselect, or flip.
      const hits = raycastInstances(e);
      const hit = hits[0];

      if (modeRef.current === "flip") {
        if (hit && hit.face) {
          const id = hit.object.userData.id;
          const inst = instancesRef.current.get(id);
          const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
          const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
          const down = new THREE.Vector3(0, -1, 0);
          const alignQuat = new THREE.Quaternion().setFromUnitVectors(worldNormal, down);
          inst.group.quaternion.premultiply(alignQuat);
          dropToBedGroup(inst.group);
          selectedIdRef.current = id;
          setSelectedId(id);
          reportSelectedTransform();
          modeRef.current = "rotate";
          setMode("rotate");
          pushHistory();
        }
        return;
      }

      if (hit) {
        const id = hit.object.userData.id;
        selectedIdRef.current = id;
        setSelectedId(id);
        reportSelectedTransform();
      } else {
        selectedIdRef.current = null;
        setSelectedId(null);
      }
    }

    function onKeyDown(e) {
      const active = document.activeElement;
      const tag = active && active.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === "c") { e.preventDefault(); copySelected(); }
      else if (key === "v") { e.preventDefault(); pasteClipboard(); }
      else if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (key === "y" || (key === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    }

    function onGlobalKeyDown(e) {
      const active = document.activeElement;
      const tag = active && active.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIdRef.current != null) {
        e.preventDefault();
        deleteSelected();
      }
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keydown", onGlobalKeyDown);

    stateRef.current = {
      scene, camera, renderer, controls, assemblyGroup,
      createInstance, dropToBedGroup, clampGroupToBed,
      reportSelectedTransform, pushHistory, syncUiFlags,
      undo, redo, copySelected, pasteClipboard, deleteSelected,
      nudge, resetPlacement,
    };

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keydown", onGlobalKeyDown);
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

  // Load mesh when meshUrl changes -- resets the whole assembly to one instance
  useEffect(() => {
    const { scene, assemblyGroup, camera, controls, createInstance, dropToBedGroup, reportSelectedTransform, pushHistory, syncUiFlags } = stateRef.current;
    if (!scene || !assemblyGroup || !meshUrl) return;

    setLoading(true);
    setError(null);
    setMode("rotate");

    fetch(meshUrl)
      .then((r) => r.json())
      .then(({ positions, indices }) => {
        instancesRef.current.forEach(({ group }) => assemblyGroup.remove(group));
        instancesRef.current.clear();
        nextIdRef.current = 1;
        historyRef.current = [];
        historyIndexRef.current = -1;
        clipboardRef.current = null;

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
        sharedGeometryRef.current = geometry;

        const id = nextIdRef.current++;
        const inst = createInstance(id);
        instancesRef.current.set(id, inst);
        dropToBedGroup(inst.group);
        setPartCount(1);
        selectedIdRef.current = id;
        setSelectedId(id);

        // Frame camera on the part
        geometry.computeBoundingSphere();
        const radius = geometry.boundingSphere.radius || 50;
        camera.position.set(radius * 2.2, radius * 2.2, radius * 2.2);
        controls.target.set(0, radius * 0.3, 0);
        controls.update();

        reportSelectedTransform();
        pushHistory();
        syncUiFlags();
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [meshUrl]);

  const hint =
    mode === "flip" ? "Click a face on the part below."
    : mode === "move" ? "Drag the selected part to slide it around the bed."
    : "Click to select. Drag a part to rotate it. Drag empty space to orbit camera.";

  return (
    <div>
      <div
        ref={containerRef}
        style={{
          width: "100%", height: 360, borderRadius: 8, overflow: "hidden",
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
            {mode === "flip" ? "Click a face to place it flat on the bed" : "Drag the selected part to move it"}
          </div>
        )}
      </div>
      {error && <div style={{ color: "#e08080", fontSize: 12, marginTop: 4 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "#9aa0ab" }}>{hint}</span>
        <button
          onClick={() => setMode((m) => (m === "move" ? "rotate" : "move"))}
          style={{ fontSize: 11, padding: "2px 8px", background: mode === "move" ? "#4f5cff" : undefined, color: mode === "move" ? "#fff" : undefined }}
        >
          Move
        </button>
        <button
          onClick={() => setMode((m) => (m === "flip" ? "rotate" : "flip"))}
          style={{ fontSize: 11, padding: "2px 8px", background: mode === "flip" ? "#4f5cff" : undefined, color: mode === "flip" ? "#fff" : undefined }}
        >
          Flip to face
        </button>
        <button onClick={() => stateRef.current.resetPlacement?.()} style={{ fontSize: 11, padding: "2px 8px" }}>Reset</button>
        {["x", "y", "z"].map((axis) => (
          <span key={axis} style={{ fontSize: 11, color: "#9aa0ab" }}>
            {axis.toUpperCase()}: {rotation[axis].toFixed(0)}°
            <button onClick={() => stateRef.current.nudge?.(axis, 90)} style={{ fontSize: 10, marginLeft: 4, padding: "1px 5px" }}>+90°</button>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "#9aa0ab" }}>{partCount} part{partCount === 1 ? "" : "s"} on bed</span>
        <button onClick={() => stateRef.current.copySelected?.()} disabled={selectedId == null} style={{ fontSize: 11, padding: "2px 8px" }} title="Ctrl/Cmd+C">Copy</button>
        <button onClick={() => stateRef.current.pasteClipboard?.()} disabled={!uiFlags.hasClipboard} style={{ fontSize: 11, padding: "2px 8px" }} title="Ctrl/Cmd+V">Paste</button>
        <button onClick={() => stateRef.current.deleteSelected?.()} disabled={selectedId == null || partCount <= 1} style={{ fontSize: 11, padding: "2px 8px" }} title="Delete / Backspace">Delete</button>
        <button onClick={() => stateRef.current.undo?.()} disabled={!uiFlags.canUndo} style={{ fontSize: 11, padding: "2px 8px" }} title="Ctrl/Cmd+Z">Undo</button>
        <button onClick={() => stateRef.current.redo?.()} disabled={!uiFlags.canRedo} style={{ fontSize: 11, padding: "2px 8px" }} title="Ctrl/Cmd+Y">Redo</button>
      </div>
    </div>
  );
}
