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


  const trail = new trailCanvas(width, height);
  let canv = trail.canvas;
  canv.style.position = 'absolute';
  canv.style.top = '0';
  canv.style.left = '0';
  canv.style.zIndex = '1000';
  canv.style.width = '100px';
  canv.style.height = `${200 * height / width}px`;
  document.body.appendChild(canv);

  let trailTexture = new THREE.CanvasTexture(trail.getTexture());
  trailTexture.flipY = false;
  trailTexture.needsUpdate = true;

  let loadedModel: THREE.Group | null = null;
  let modelBoundingBox = new THREE.Box3();
  let modelCenter = new THREE.Vector3();
  let modelSize = new THREE.Vector3();

  const mouse = new THREE.Vector3();
  const mouse2D = new THREE.Vector2();
  const uMouse = uniform(mouse, 'vec3');

  // let dummy = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
  // scene.add(dummy);
  document.addEventListener('mousemove', (event) => {
    // Always update mouse2D for trail canvas
    mouse2D.set(event.clientX, event.clientY);

    if (!loadedModel) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const canvasWidth = rect.width;
    const canvasHeight = rect.height;
    let mouseX = ((event.clientX - rect.left) / canvasWidth) * 2 - 1;
    let mouseY = -((event.clientY - rect.top) / canvasHeight) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
    const intersects = raycaster.intersectObjects(loadedModel.children);
    if (intersects?.length > 0) {
      // console.log(intersects[0].point);
      uMouse.value.copy(intersects[0].point);
    }
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
    // Zoom in by reducing camera distance (multiply by factor less than 1)
    cameraDistance *= 0.4; // 0.4 = 40% of original distance = 60% zoom in
    camera.position.set(0, 0, cameraDistance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

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
          const ndc = cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(pos, 1.));
          uvscreen.assign(ndc.xyz.div(ndc.w).add(1.).div(2.));
          uvscreen.y = uvscreen.y.oneMinus()
          const extrudeTex = texture(trailTexture, uvscreen);
          const extrude = extrudeTex.r; // Use red channel for grayscale value
          pos.z.mulAssign(mix(0., 1., extrude))

          return pos
        })();

        material.colorNode = Fn(() => {
          const dist = distance(positionWorld, uMouse);
          const tt1 = sRGBTransferOETF(texture(texture1, uv()));
          const tt2 = sRGBTransferOETF(texture(texture2, uv()));
          const extrudeTex = texture(trailTexture, screenUV);
          const extrude = extrudeTex.r; // Use red channel for grayscale value
          let level0 = vec3(0.545, 0.545, 0.545); // Gray #858585 (5% lighter)
          let level1 = tt2.b;
          let level2 = tt2.g;
          let level3 = tt2.r;
          let level4 = tt1.b;
          let level5 = tt1.g;
          let level6 = tt1.r;
          // Threshold: when extrude is below this, show base color (refill condition)
          const threshold = 0.05;
          // Create a smooth, gradual transition from level0 to level1
          // Use a wider smoothstep range for much softer transition
          const transitionStart = 0.0;
          const transitionEnd = 0.15;
          // Smooth transition factor: gradually increases from 0 to 1
          const transitionFactor = smoothstep(transitionStart, transitionEnd, extrude);
          // Start with level0, gradually transition to other levels
          let final = level0;
          // Make the first transition (level0 to level1) very soft and gradual
          final = mix(final, level1, smoothstep(threshold, 0.20, extrude));
          final = mix(final, level2, smoothstep(0.143, 0.286, extrude));
          final = mix(final, level3, smoothstep(0.286, 0.429, extrude));
          final = mix(final, level4, smoothstep(0.429, 0.571, extrude));
          final = mix(final, level5, smoothstep(0.571, 0.714, extrude));
          final = mix(final, level6, smoothstep(0.714, 0.857, extrude));


          // let finalCool = palette({ t: final })
          // let finalCool = palette({ t: final.add(5.) })
          // return vec4(vec3(finalCool), 1);


          return vec4(vec3(final), 1);


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
    // Update trail canvas size
    trail.canvas.width = width;
    trail.canvas.height = height;
    trail.canvas.style.width = '100px';
    trail.canvas.style.height = `${200 * height / width}px`;
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
