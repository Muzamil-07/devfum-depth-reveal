import type { Sketch, SketchSettings } from "ssam";
import { ssam } from "ssam";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { Fn, normalLocal, positionLocal, uv, vec4, positionWorld, vec2, vec3, mix, smoothstep, cameraProjectionMatrix, uniform, distance, texture, screenUV, modelViewMatrix, varying, cos, float, sRGBTransferOETF } from "three/tsl";
import {
  BoxGeometry,
  Color,
  Mesh,
  NodeMaterial,
  PerspectiveCamera,
  Scene,
  WebGPURenderer,
} from "three/webgpu";

import modelUrl from "./assets/models/reliefs_low_compressed.glb";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import trailCanvas from "./trail.js";

const sketch: Sketch<"webgpu"> = async ({
  wrap,
  canvas,
  width,
  height,
  pixelRatio,
}) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const renderer = new WebGPURenderer({ canvas, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(new Color(0xffffff), 1);
  await renderer.init();


  const raycaster = new THREE.Raycaster();

  const camera = new PerspectiveCamera(50, width / height, 0.1, 1000);
  // Fixed camera position - looking straight at the model
  // Camera distance will be adjusted when model loads to fit full width
  let cameraDistance = 5;
  camera.position.set(0, 0, cameraDistance);
  camera.lookAt(0, 0, 0);

  const stats = new Stats();
  document.body.appendChild(stats.dom);

  const scene = new Scene();

  // START OF THE CODE
  // ================================
  // Use DRACOLoader with GLTFLoader for decompression support
  const dracoLoader = new DRACOLoader();
  // You may need to adjust the path below depending on your file structure or use DRACOLoader.getDecoderModule()
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

  const materials = [];


  // Trail canvas will be resized after model loads
  const trail = new trailCanvas(512, 512);
  let canv = trail.canvas;
  canv.style.position = 'absolute';
  canv.style.top = '0';
  canv.style.left = '0';
  canv.style.zIndex = '1000';
  canv.style.width = '100px';
  canv.style.height = `100px`;
  document.body.appendChild(canv);

  let trailTexture = new THREE.CanvasTexture(trail.getTexture());
  trailTexture.flipY = false;
  trailTexture.needsUpdate = true;

  let loadedModel: THREE.Group | null = null;
  let modelBoundingBox = new THREE.Box3();
  let modelCenter = new THREE.Vector3();
  let modelSize = new THREE.Vector3();
  let modelScreenHeight = height; // Will be updated after model loads
  let modelScreenWidth = width; // Will be updated after model loads

  const mouse = new THREE.Vector3();
  const mouse2D = new THREE.Vector2(-1, -1); // Initialize to invalid position
  const uMouse = uniform(mouse, 'vec3');

  // let dummy = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
  // scene.add(dummy);
  document.addEventListener('mousemove', (event) => {
    // Convert mouse coordinates to canvas coordinates for trail
    const rect = renderer.domElement.getBoundingClientRect();
    // Check if mouse is within canvas bounds
    const isWithinBounds = 
      event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom;
    
    if (!loadedModel) {
      if (isWithinBounds) {
        const canvasX = ((event.clientX - rect.left) / rect.width) * width;
        const canvasY = ((event.clientY - rect.top) / rect.height) * height;
        mouse2D.set(canvasX, canvasY);
      } else {
        (trail as any).clearMouse();
        mouse2D.set(-1, -1);
      }
      return;
    }
    
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;
    let mouseX = ((event.clientX - rect.left) / canvasWidth) * 2 - 1;
    let mouseY = -((event.clientY - rect.top) / canvasHeight) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
    const intersects = raycaster.intersectObjects(loadedModel.children);
    
    if (intersects?.length > 0 && isWithinBounds) {
      // Map world position to trail canvas coordinates
      const worldPos = intersects[0].point;
      uMouse.value.copy(worldPos);
      
      // Map world Y position to trail canvas Y coordinate
      // Model Y ranges from modelBoundingBox.min.y to modelBoundingBox.max.y
      // Trail canvas Y ranges from 0 to trail.canvas.height
      const normalizedX = (worldPos.x - modelBoundingBox.min.x) / (modelBoundingBox.max.x - modelBoundingBox.min.x);
      const normalizedY = (worldPos.y - modelBoundingBox.min.y) / (modelBoundingBox.max.y - modelBoundingBox.min.y);
      
      const trailX = normalizedX * trail.canvas.width;
      const trailY = normalizedY * trail.canvas.height;
      
      mouse2D.set(trailX, trailY);
    } else {
      // Mouse is outside canvas or no intersection, clear brush
      (trail as any).clearMouse();
      mouse2D.set(-1, -1);
    }
  });
  
  // Clear brush when mouse leaves the canvas area
  document.addEventListener('mouseleave', (event) => {
    // Check if mouse left the document or the canvas area
    if (!event.relatedTarget || !renderer.domElement.contains(event.relatedTarget as Node)) {
      (trail as any).clearMouse();
      // Set mouse2D to null or outside bounds to stop drawing
      mouse2D.set(-1, -1);
    }
  });
  
  // Also handle mouseleave on the canvas element itself
  renderer.domElement.addEventListener('mouseleave', () => {
    (trail as any).clearMouse();
    mouse2D.set(-1, -1);
  });

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  loader.load(modelUrl, (gltf) => {
    const model = gltf.scene;
    loadedModel = model;

    // Calculate bounding box and scale model to fit screen width
    modelBoundingBox.setFromObject(model);
    modelBoundingBox.getCenter(modelCenter);
    modelBoundingBox.getSize(modelSize);
    
    // Calculate visible width at current camera distance
    const fovRad = (camera.fov * Math.PI) / 180;
    const visibleWidth = 2 * cameraDistance * Math.tan(fovRad / 2);
    
    // Scale model to fill 100% of visible width
    const scale = visibleWidth / modelSize.x;
    model.scale.set(scale, scale, scale);
    
    // Recalculate bounding box after scaling
    modelBoundingBox.setFromObject(model);
    modelBoundingBox.getCenter(modelCenter);
    modelBoundingBox.getSize(modelSize);
    
    // Center the model
    model.position.sub(modelCenter);
    
    // Fine-tune camera distance to ensure model fills width exactly
    const finalVisibleWidth = modelSize.x;
    cameraDistance = finalVisibleWidth / (2 * Math.tan(fovRad / 2));
    // Zoom level
    cameraDistance *= 0.5; // 0.5 = 50% of original distance
    camera.position.set(0, 0, cameraDistance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    
    // Resize trail canvas to match model's aspect ratio
    // Model dimensions in world space: modelSize.x × modelSize.y
    // We want trail canvas to have same aspect ratio as model
    const modelAspect = modelSize.x / modelSize.y;
    
    // Use a reasonable base resolution (e.g., 1024 pixels for width)
    const trailWidth = 1024;
    const trailHeight = Math.round(trailWidth / modelAspect);
    
    trail.canvas.width = trailWidth;
    trail.canvas.height = trailHeight;
    trail.circleRadius = trailWidth * 0.08; // Update brush size
    
    // Update display size (for debugging)
    trail.canvas.style.width = '100px';
    trail.canvas.style.height = `${100 / modelAspect}px`;
    
    // Store screen dimensions for reference
    modelScreenWidth = trailWidth;
    modelScreenHeight = trailHeight;

    gltf.scene.traverse((child) => {
      if (child instanceof Mesh) {
        let material = new THREE.NodeMaterial();
        let texture1 = child.material.map;
        let texture2 = child.material.emissiveMap;
        let uvscreen = varying(vec2(0., 0.));

        // const palette = Fn((t: any) => {
        //   const a = vec3(0.5, 0.5, 0.5);
        //   const b = vec3(0.5, 0.5, 0.5);
        //   const c = vec3(1.0, 1.0, 1.0);
        //   const d = vec3(0.0, 0.10, 0.20);
        //   return a.add(b.mul(cos(float(6.283185).mul(c.mul(t).add(d)))));
        // });


        // const sRGBTransferOETF = Fn(({ [color] }) => {
        //   const a = color.pow(0.41666).mul(1.055).sub(0.055);
        //   const b = color.mul(12.92);
        //   const factor = color.lessThanEqual(0.0031308);

        //   const rgbResult = mix(a, b, factor);

        //   return rgbResult;
        // }); 




        material.positionNode = Fn(() => {
          const pos = positionLocal
          // Use world-space position mapped to model bounding box for UV
          const worldPos = positionWorld;
          const minBounds = vec3(modelBoundingBox.min.x, modelBoundingBox.min.y, modelBoundingBox.min.z);
          const maxBounds = vec3(modelBoundingBox.max.x, modelBoundingBox.max.y, modelBoundingBox.max.z);
          const normalizedPos = worldPos.sub(minBounds).div(maxBounds.sub(minBounds));
          uvscreen.assign(vec2(normalizedPos.x, normalizedPos.y));
          
          const extrudeTex = texture(trailTexture, uvscreen);
          const extrude = extrudeTex.r; // Use red channel for grayscale value
          pos.z.mulAssign(mix(0., 1, extrude))

          return pos
        })();

        material.colorNode = Fn(() => {
          const dist = distance(positionWorld, uMouse);
          const tt1 = sRGBTransferOETF(texture(texture1, uv()));
          const tt2 = sRGBTransferOETF(texture(texture2, uv()));
          // Use the same world-space UV as in positionNode
          const extrudeTex = texture(trailTexture, uvscreen);
          const extrude = extrudeTex.r; // Use red channel for grayscale value
          
          // Use vec4 for all levels to track both color and alpha
          let level0 = vec4(0.839, 0.839, 0.839, 0.5); // Light gray with 50% opacity
          let level1 = vec4(tt2.b.add(0.3), tt2.b.add(0.3), tt2.b.add(0.3), 0.02);
          let level2 = vec4(tt2.g.add(0.3), tt2.g.add(0.3), tt2.g.add(0.3), 0.80);
          let level3 = vec4(tt2.r.add(0.3), tt2.r.add(0.3), tt2.r.add(0.3), 0.80);
          let level4 = vec4(tt1.b.add(0.3), tt1.b.add(0.3), tt1.b.add(0.3), 0.80);
          let level5 = vec4(tt1.g.add(0.3), tt1.g.add(0.3), tt1.g.add(0.3), 0.70);
          let level6 = vec4(tt1.r.add(0.3), tt1.r.add(0.3), tt1.r.add(0.3), 0.70);
          
          // Threshold: when extrude is below this, show base color (refill condition)
          const threshold = 0.05;
          // Create ultra-smooth, gradual transitions from level0 to level1
          // Use wider smoothstep ranges for softer, more gradual color transitions
          // First transition is extra wide for maximum softness
          const step1 = mix(level0, level1, smoothstep(threshold, 0.35, extrude));
          const step2 = mix(step1, level2, smoothstep(0.20, 0.40, extrude));
          const step3 = mix(step2, level3, smoothstep(0.35, 0.55, extrude));
          const step4 = mix(step3, level4, smoothstep(0.50, 0.70, extrude));
          const step5 = mix(step4, level5, smoothstep(0.65, 0.85, extrude));
          const final = mix(step5, level6, smoothstep(0.80, 0.95, extrude));


          // let finalCool = palette({ t: final })
          // let finalCool = palette({ t: final.add(5.) })
          // return vec4(vec3(finalCool), 1);


          return final;


        })();
        child.material = material;
        materials.push(material);
      }
    });
    scene.add(model);
  });

  // Handle scroll to move camera vertically
  let scrollY = 0;
  const handleScroll = () => {
    scrollY = window.scrollY;
    // Move camera vertically based on scroll
    // Adjust the multiplier to control scroll sensitivity
    camera.position.y = -scrollY * 0.01;
    camera.lookAt(0, -scrollY * 0.01, 0);
  };
  window.addEventListener('scroll', handleScroll);

  wrap.render = ({ playhead }) => {
    trail.update(mouse2D);
    trailTexture.needsUpdate = true;
    stats.update();
    renderer.render(scene, camera);
  };

  wrap.resize = ({ width, height }) => {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    // Trail canvas size is based on model dimensions, not viewport
    // Keep the aspect ratio consistent with the model
    if (loadedModel) {
      const modelAspect = modelSize.x / modelSize.y;
      trail.canvas.style.width = '100px';
      trail.canvas.style.height = `${100 / modelAspect}px`;
    }
  };

  wrap.unload = () => {
    window.removeEventListener('scroll', handleScroll);
    renderer.dispose();
  };
};

const settings: SketchSettings = {
  mode: "webgpu",
  // dimensions: [800, 800],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ["webm"],
};

ssam(sketch, settings);
