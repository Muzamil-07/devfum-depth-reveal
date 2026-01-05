import type { Sketch, SketchSettings } from "ssam";
import { ssam } from "ssam";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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
  camera.position.set(1, 2, 3);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);

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

  const mouse = new THREE.Vector3();
  const mouse2D = new THREE.Vector2();
  const uMouse = uniform(mouse, 'vec3');

  // let dummy = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
  // scene.add(dummy);
  document.addEventListener('mousemove', (event) => {
    // Always update mouse2D for trail canvas
    mouse2D.set(event.clientX, event.clientY);

    if (!loadedModel) return;
    let mouseX = (event.clientX / width) * 2 - 1;
    let mouseY = -(event.clientY / height) * 2 + 1;
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


    gltf.scene.traverse((child) => {
      if (child instanceof Mesh) {
        let material = new THREE.NodeMaterial();
        let texture1 = child.material.map;
        let texture2 = child.material.emissiveMap;
        let uvscreen = varying(vec2(0., 0.));

        const palette = Fn(({ t }) => {
          const a = vec3(0.5, 0.5, 0.5);
          const b = vec3(0.5, 0.5, 0.5);
          const c = vec3(1.0, 1.0, 1.0);
          const d = vec3(0.0, 0.10, 0.20);
          return a.add(b.mul(cos(float(6.283185).mul(c.mul(t).add(d)))));
        });


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
          const extrude = texture(trailTexture, uvscreen);
          pos.z.mulAssign(mix(0., 1., extrude))

          return pos
        })();

        material.colorNode = Fn(() => {
          const dist = distance(positionWorld, uMouse);
          const tt1 = sRGBTransferOETF(texture(texture1, uv()));
          const tt2 = sRGBTransferOETF(texture(texture2, uv()));
          const extrude = texture(trailTexture, screenUV);
          let level0 = tt2.b;
          let level1 = tt2.g;
          let level2 = tt2.r;
          let level3 = tt1.b;
          let level4 = tt1.g;
          let level5 = tt1.r;
          let final = level0;
          final = mix(final, level1, smoothstep(0., 0.2, extrude));
          final = mix(final, level2, smoothstep(0.2, 0.4, extrude));
          final = mix(final, level3, smoothstep(0.4, 0.6, extrude));
          final = mix(final, level4, smoothstep(0.6, 0.8, extrude));
          final = mix(final, level5, smoothstep(0.8, 1., extrude));


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

  wrap.render = ({ playhead }) => {
    trail.update(mouse2D);
    trailTexture.needsUpdate = true;
    controls.update();
    stats.update();
    renderer.render(scene, camera);
  };

  wrap.resize = ({ width, height }) => {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  wrap.unload = () => {
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
