<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import * as THREE from 'three';

  export let azimuth: number = 0;
  export let elevation: number = 0;
  export let distance: number = 5;
  export let imageSource: HTMLCanvasElement | null = null;

  const dispatch = createEventDispatcher<{
    change: { azimuth: number; elevation: number; distance: number };
  }>();

  let containerEl: HTMLDivElement;
  let mounted = false;

  // Three.js objects
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let previewCamera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let activeCamera: THREE.Camera;

  // Scene objects
  let cameraIndicator: THREE.Mesh;
  let camGlow: THREE.Mesh;
  let azimuthHandle: THREE.Mesh;
  let azGlow: THREE.Mesh;
  let elevationHandle: THREE.Mesh;
  let elGlow: THREE.Mesh;
  let distanceHandle: THREE.Mesh;
  let distGlow: THREE.Mesh;
  let glowRing: THREE.Mesh;
  let imagePlane: THREE.Mesh;
  let imageFrame: THREE.LineSegments;
  let planeMat: THREE.MeshBasicMaterial;
  let distanceTube: THREE.Mesh | null = null;

  // Control objects
  let azimuthRing: THREE.Mesh;
  let elevationArc: THREE.Mesh;
  let gridHelper: THREE.GridHelper;

  // Constants
  const CENTER = new THREE.Vector3(0, 0.5, 0);
  const AZIMUTH_RADIUS = 1.8;
  const ELEVATION_RADIUS = 1.4;
  const ELEV_ARC_X = -0.8;

  // Live values for smooth updates
  let liveAzimuth = azimuth;
  let liveElevation = elevation;
  let liveDistance = distance;

  // Interaction state
  let isDragging = false;
  let dragTarget: string | null = null;
  let hoveredHandle: { mesh: THREE.Mesh; glow: THREE.Mesh; name: string } | null = null;
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Distance drag state
  let dragStartCameraDir: THREE.Vector3 | null = null;
  let dragStartDistance: number = 0;
  let dragStartMouseProjDist: number = 0;

  // Animation
  let animationId: number | null = null;
  let time = 0;

  // Reactive updates
  $: if (mounted && azimuth !== liveAzimuth) {
    liveAzimuth = azimuth;
    updateVisuals();
  }

  $: if (mounted && elevation !== liveElevation) {
    liveElevation = elevation;
    updateVisuals();
  }

  $: if (mounted && distance !== liveDistance) {
    liveDistance = distance;
    updateVisuals();
  }

  $: if (mounted && imageSource) {
    updateImage(imageSource);
  }

  function createGridTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth = 1;
    const gridSize = 16;
    for (let i = 0; i <= size; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    return texture;
  }

  function createSubject(): void {
    const cardThickness = 0.02;
    const cardGeo = new THREE.BoxGeometry(1.2, 1.2, cardThickness);

    const frontMat = new THREE.MeshBasicMaterial({ color: 0x3a3a4a });
    const backMat = new THREE.MeshBasicMaterial({ map: createGridTexture() });
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a2a });

    const cardMaterials = [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat];
    imagePlane = new THREE.Mesh(cardGeo, cardMaterials);
    imagePlane.position.copy(CENTER);
    scene.add(imagePlane);

    planeMat = frontMat;

    // Frame
    const frameGeo = new THREE.EdgesGeometry(cardGeo);
    const frameMat = new THREE.LineBasicMaterial({ color: 0xE93D82 });
    imageFrame = new THREE.LineSegments(frameGeo, frameMat);
    imageFrame.position.copy(CENTER);
    scene.add(imageFrame);

    // Glow ring
    const glowRingGeo = new THREE.RingGeometry(0.55, 0.58, 64);
    const glowRingMat = new THREE.MeshBasicMaterial({
      color: 0xE93D82,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });
    glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    glowRing.position.set(0, 0.01, 0);
    glowRing.rotation.x = -Math.PI / 2;
    scene.add(glowRing);
  }

  function createCameraIndicator(): void {
    const camGeo = new THREE.ConeGeometry(0.15, 0.4, 4);
    const camMat = new THREE.MeshStandardMaterial({
      color: 0xE93D82,
      emissive: 0xE93D82,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2
    });
    cameraIndicator = new THREE.Mesh(camGeo, camMat);
    scene.add(cameraIndicator);

    const camGlowGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const camGlowMat = new THREE.MeshBasicMaterial({
      color: 0xff6ba8,
      transparent: true,
      opacity: 0.8
    });
    camGlow = new THREE.Mesh(camGlowGeo, camGlowMat);
    scene.add(camGlow);
  }

  function createAzimuthRing(): void {
    const azRingGeo = new THREE.TorusGeometry(AZIMUTH_RADIUS, 0.04, 16, 100);
    const azRingMat = new THREE.MeshBasicMaterial({
      color: 0xE93D82,
      transparent: true,
      opacity: 0.7
    });
    azimuthRing = new THREE.Mesh(azRingGeo, azRingMat);
    azimuthRing.rotation.x = Math.PI / 2;
    azimuthRing.position.y = 0.02;
    scene.add(azimuthRing);

    // Handle
    const azHandleGeo = new THREE.SphereGeometry(0.16, 32, 32);
    const azHandleMat = new THREE.MeshStandardMaterial({
      color: 0xE93D82,
      emissive: 0xE93D82,
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.4
    });
    azimuthHandle = new THREE.Mesh(azHandleGeo, azHandleMat);
    scene.add(azimuthHandle);

    const azGlowGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const azGlowMat = new THREE.MeshBasicMaterial({
      color: 0xE93D82,
      transparent: true,
      opacity: 0.2
    });
    azGlow = new THREE.Mesh(azGlowGeo, azGlowMat);
    scene.add(azGlow);
  }

  function createElevationArc(): void {
    const arcPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i++) {
      const angle = (-30 + (90 * i / 32)) * Math.PI / 180;
      arcPoints.push(new THREE.Vector3(
        ELEV_ARC_X,
        ELEVATION_RADIUS * Math.sin(angle) + CENTER.y,
        ELEVATION_RADIUS * Math.cos(angle)
      ));
    }
    const arcCurve = new THREE.CatmullRomCurve3(arcPoints);
    const elArcGeo = new THREE.TubeGeometry(arcCurve, 32, 0.04, 8, false);
    const elArcMat = new THREE.MeshBasicMaterial({
      color: 0x00FFD0,
      transparent: true,
      opacity: 0.8
    });
    elevationArc = new THREE.Mesh(elArcGeo, elArcMat);
    scene.add(elevationArc);

    // Handle
    const elHandleGeo = new THREE.SphereGeometry(0.16, 32, 32);
    const elHandleMat = new THREE.MeshStandardMaterial({
      color: 0x00FFD0,
      emissive: 0x00FFD0,
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.4
    });
    elevationHandle = new THREE.Mesh(elHandleGeo, elHandleMat);
    scene.add(elevationHandle);

    const elGlowGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const elGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00FFD0,
      transparent: true,
      opacity: 0.2
    });
    elGlow = new THREE.Mesh(elGlowGeo, elGlowMat);
    scene.add(elGlow);
  }

  function createDistanceHandle(): void {
    const distHandleGeo = new THREE.SphereGeometry(0.15, 32, 32);
    const distHandleMat = new THREE.MeshStandardMaterial({
      color: 0xFFB800,
      emissive: 0xFFB800,
      emissiveIntensity: 0.7,
      metalness: 0.5,
      roughness: 0.3
    });
    distanceHandle = new THREE.Mesh(distHandleGeo, distHandleMat);
    scene.add(distanceHandle);

    const distGlowGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const distGlowMat = new THREE.MeshBasicMaterial({
      color: 0xFFB800,
      transparent: true,
      opacity: 0.25
    });
    distGlow = new THREE.Mesh(distGlowGeo, distGlowMat);
    scene.add(distGlow);
  }

  function updateDistanceLine(start: THREE.Vector3, end: THREE.Vector3): void {
    if (distanceTube) {
      scene.remove(distanceTube);
      distanceTube.geometry.dispose();
      (distanceTube.material as THREE.Material).dispose();
    }
    const path = new THREE.LineCurve3(start, end);
    const tubeGeo = new THREE.TubeGeometry(path, 1, 0.025, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0xFFB800,
      transparent: true,
      opacity: 0.8
    });
    distanceTube = new THREE.Mesh(tubeGeo, tubeMat);
    scene.add(distanceTube);
  }

  function updateVisuals(): void {
    if (!scene) return;

    const azRad = (liveAzimuth * Math.PI) / 180;
    const elRad = (liveElevation * Math.PI) / 180;
    const visualDist = 2.6 - (liveDistance / 10) * 2.0;

    // Camera indicator
    const camX = visualDist * Math.sin(azRad) * Math.cos(elRad);
    const camY = CENTER.y + visualDist * Math.sin(elRad);
    const camZ = visualDist * Math.cos(azRad) * Math.cos(elRad);

    cameraIndicator.position.set(camX, camY, camZ);
    cameraIndicator.lookAt(CENTER);
    cameraIndicator.rotateX(Math.PI / 2);
    camGlow.position.copy(cameraIndicator.position);

    // Azimuth handle
    const azX = AZIMUTH_RADIUS * Math.sin(azRad);
    const azZ = AZIMUTH_RADIUS * Math.cos(azRad);
    azimuthHandle.position.set(azX, 0.16, azZ);
    azGlow.position.copy(azimuthHandle.position);

    // Elevation handle
    const elY = CENTER.y + ELEVATION_RADIUS * Math.sin(elRad);
    const elZ = ELEVATION_RADIUS * Math.cos(elRad);
    elevationHandle.position.set(ELEV_ARC_X, elY, elZ);
    elGlow.position.copy(elevationHandle.position);

    // Distance handle
    const distT = 0.15 + ((10 - liveDistance) / 10) * 0.7;
    distanceHandle.position.lerpVectors(CENTER, cameraIndicator.position, distT);
    distGlow.position.copy(distanceHandle.position);

    // Distance line
    updateDistanceLine(CENTER.clone(), cameraIndicator.position.clone());

    // Preview camera
    previewCamera.position.copy(cameraIndicator.position);
    previewCamera.lookAt(CENTER);

    // Glow ring animation
    glowRing.rotation.z += 0.005;
  }

  function initThreeJS(): void {
    const width = containerEl.clientWidth || 300;
    const height = containerEl.clientHeight || 300;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    // Camera
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(4, 3.5, 4);
    camera.lookAt(0, 0.3, 0);

    // Preview camera
    previewCamera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    activeCamera = camera;

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerEl.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(5, 10, 5);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xE93D82, 0.3);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // Grid
    gridHelper = new THREE.GridHelper(5, 20, 0x1a1a2e, 0x12121a);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    createSubject();
    createCameraIndicator();
    createAzimuthRing();
    createElevationArc();
    createDistanceHandle();
    updateVisuals();

    if (imageSource) {
      updateImage(imageSource);
    }
  }

  function getMousePos(event: MouseEvent | TouchEvent): void {
    const rect = renderer.domElement.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in event && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else if ('clientX' in event) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      return;
    }

    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  function setHandleScale(handle: THREE.Mesh, glow: THREE.Mesh | null, scale: number): void {
    handle.scale.setScalar(scale);
    if (glow) glow.scale.setScalar(scale);
  }

  function onPointerDown(event: MouseEvent | TouchEvent): void {
    event.preventDefault();
    getMousePos(event);
    raycaster.setFromCamera(mouse, camera);

    const handles = [
      { mesh: azimuthHandle, glow: azGlow, name: 'azimuth' },
      { mesh: elevationHandle, glow: elGlow, name: 'elevation' },
      { mesh: distanceHandle, glow: distGlow, name: 'distance' }
    ];

    for (const h of handles) {
      if (raycaster.intersectObject(h.mesh).length > 0) {
        isDragging = true;
        dragTarget = h.name;
        setHandleScale(h.mesh, h.glow, 1.3);
        renderer.domElement.style.cursor = 'grabbing';

        // distanceドラッグ開始時の状態を保存
        if (h.name === 'distance') {
          const toCamera = cameraIndicator.position.clone().sub(CENTER);
          dragStartCameraDir = toCamera.clone().normalize();
          dragStartDistance = liveDistance;

          // ドラッグ開始時のマウス投影距離を記録
          const distPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CENTER.y);
          const intersect = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(distPlane, intersect)) {
            const cameraDirXZ = new THREE.Vector2(dragStartCameraDir.x, dragStartCameraDir.z).normalize();
            const mouseXZ = new THREE.Vector2(intersect.x - CENTER.x, intersect.z - CENTER.z);
            dragStartMouseProjDist = mouseXZ.dot(cameraDirXZ);
          }
        }
        return;
      }
    }
  }

  function onPointerMove(event: MouseEvent | TouchEvent): void {
    event.preventDefault();
    getMousePos(event);
    raycaster.setFromCamera(mouse, camera);

    if (!isDragging) {
      const handles = [
        { mesh: azimuthHandle, glow: azGlow, name: 'azimuth' },
        { mesh: elevationHandle, glow: elGlow, name: 'elevation' },
        { mesh: distanceHandle, glow: distGlow, name: 'distance' }
      ];

      let foundHover: typeof handles[0] | null = null;
      for (const h of handles) {
        if (raycaster.intersectObject(h.mesh).length > 0) {
          foundHover = h;
          break;
        }
      }

      if (hoveredHandle && hoveredHandle !== foundHover) {
        setHandleScale(hoveredHandle.mesh, hoveredHandle.glow, 1.0);
      }

      if (foundHover) {
        setHandleScale(foundHover.mesh, foundHover.glow, 1.15);
        renderer.domElement.style.cursor = 'grab';
        hoveredHandle = foundHover;
      } else {
        renderer.domElement.style.cursor = 'default';
        hoveredHandle = null;
      }
      return;
    }

    // Dragging
    const plane = new THREE.Plane();
    const intersect = new THREE.Vector3();

    if (dragTarget === 'azimuth') {
      plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0));
      if (raycaster.ray.intersectPlane(plane, intersect)) {
        let angle = Math.atan2(intersect.x, intersect.z) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        // 45度単位にスナップ
        const snapped = Math.round(angle / 45) * 45;
        liveAzimuth = snapped % 360;
        azimuth = liveAzimuth;
        updateVisuals();
        notifyChange();
      }
    } else if (dragTarget === 'elevation') {
      const elevPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -ELEV_ARC_X);
      if (raycaster.ray.intersectPlane(elevPlane, intersect)) {
        const relY = intersect.y - CENTER.y;
        const relZ = intersect.z;
        let angle = Math.atan2(relY, relZ) * (180 / Math.PI);
        // 30度単位にスナップ（-30, 0, 30, 60）
        const snapped = Math.round(angle / 30) * 30;
        liveElevation = Math.max(-30, Math.min(60, snapped));
        elevation = liveElevation;
        updateVisuals();
        notifyChange();
      }
    } else if (dragTarget === 'distance' && dragStartCameraDir) {
      // Y = CENTER.y の水平面を使用
      const distPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CENTER.y);

      if (raycaster.ray.intersectPlane(distPlane, intersect)) {
        // ドラッグ開始時のカメラ方向（X-Z平面上）
        const cameraDirXZ = new THREE.Vector2(dragStartCameraDir.x, dragStartCameraDir.z).normalize();

        // 交点のCENTERからの位置（X-Z平面上）
        const intersectXZ = new THREE.Vector2(
          intersect.x - CENTER.x,
          intersect.z - CENTER.z
        );

        // 現在のマウス投影距離
        const currentMouseProjDist = intersectXZ.dot(cameraDirXZ);

        // ドラッグ開始時からの移動量
        const delta = currentMouseProjDist - dragStartMouseProjDist;

        // 移動量をdistance変化に変換
        // deltaが正（被写体から離れる）→ distanceが減る（wide）
        // deltaが負（被写体に近づく）→ distanceが増える（close-up）
        const sensitivity = 5; // 調整用
        const newDist = dragStartDistance - delta * sensitivity;

        // 0, 5, 10 にスナップ
        const snapped = Math.round(newDist / 5) * 5;
        liveDistance = Math.max(0, Math.min(10, snapped));
        distance = liveDistance;
        updateVisuals();
        notifyChange();
      }
    }
  }

  function onPointerUp(): void {
    if (isDragging) {
      const handles = [
        { mesh: azimuthHandle, glow: azGlow },
        { mesh: elevationHandle, glow: elGlow },
        { mesh: distanceHandle, glow: distGlow }
      ];
      handles.forEach(h => setHandleScale(h.mesh, h.glow, 1.0));
    }

    isDragging = false;
    dragTarget = null;
    renderer.domElement.style.cursor = 'default';
  }

  function onResize(): void {
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;
    if (w === 0 || h === 0) return;

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    previewCamera.aspect = w / h;
    previewCamera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function animate(): void {
    animationId = requestAnimationFrame(animate);

    time += 0.01;
    const pulse = 1 + Math.sin(time * 2) * 0.03;
    camGlow.scale.setScalar(pulse);
    glowRing.rotation.z += 0.003;

    renderer.render(scene, activeCamera);
  }

  function notifyChange(): void {
    dispatch('change', {
      azimuth: Math.round(azimuth),
      elevation: Math.round(elevation),
      distance: Math.round(distance * 10) / 10
    });
  }

  function updateImage(source: HTMLCanvasElement): void {
    if (!planeMat || !imagePlane) return;

    const tex = new THREE.CanvasTexture(source);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    planeMat.map = tex;
    planeMat.color.set(0xffffff);
    planeMat.needsUpdate = true;

    const ar = source.width / source.height;
    const maxSize = 1.5;
    let scaleX: number, scaleY: number;
    if (ar > 1) {
      scaleX = maxSize;
      scaleY = maxSize / ar;
    } else {
      scaleY = maxSize;
      scaleX = maxSize * ar;
    }
    imagePlane.scale.set(scaleX, scaleY, 1);
    imageFrame.scale.set(scaleX, scaleY, 1);
  }

  function bindEvents(): void {
    const canvas = renderer.domElement;

    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('mouseleave', onPointerUp);

    canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    canvas.addEventListener('touchmove', onPointerMove, { passive: false });
    canvas.addEventListener('touchend', onPointerUp);

    // Resize observer
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(containerEl);
  }

  function dispose(): void {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    if (renderer) {
      renderer.dispose();
    }
    if (scene) {
      scene.clear();
    }
  }

  export function reset(): void {
    azimuth = 0;
    elevation = 0;
    distance = 5;
    liveAzimuth = 0;
    liveElevation = 0;
    liveDistance = 5;
    updateVisuals();
    notifyChange();
  }

  onMount(() => {
    initThreeJS();
    bindEvents();
    animate();
    mounted = true;
  });

  onDestroy(() => {
    dispose();
  });
</script>

<div class="camera-widget-container" bind:this={containerEl}>
</div>

<style>
  .camera-widget-container {
    width: 100%;
    height: 100%;
    min-height: 300px;
    background: #0a0a0f;
    border-radius: 8px;
    overflow: hidden;
  }

  .camera-widget-container :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
