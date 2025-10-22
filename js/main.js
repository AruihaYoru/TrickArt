import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { TransformControls } from 'three/addons/TransformControls.js';
import { initUI, updateUIFromProjection } from './ui.js';
import { exportHighResImage } from './export.js';

// --- 定数定義 ---
const CM_TO_UNIT_SCALE = 0.1; // 1 3D Unit = 10cm

// --- グローバル変数 ---
let scene, camera, renderer, orbitControls, transformControls;
let foldedObject, flatPaperObject, projectionHelper, projectorCamera;
let paperMaterial, bakedMaterial;

let isBakeMode = false;
let projectionTexture = null;

// Raycasting用
let raycaster, mouse;

// DOM要素
const canvas = document.getElementById('webgl-canvas');

// --- 初期化処理 ---
async function init() {
    // 1. シーンのセットアップ
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x282c34);

    // 2. カメラのセットアップ
    const fov = 50;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 1000;
    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);

    // 3. レンダラーのセットアップ
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // 4. ライトの追加
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // 5. コントロールのセットアップ
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;

    transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls);

    // 6. ヘルパーの追加
    const gridHelper = new THREE.GridHelper(20, 20);
    scene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    // 7. Raycastingの初期化
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // 8. シェーダーとオブジェクトの非同期読み込み・生成
    await loadAssetsAndSetupScene();
    
    // 9. イベントリスナーの設定
    setupEventListeners();

    // 10. UIの初期化
    initUI(getAppHandles());

    // 11. アニメーションループ開始
    animate();
}

// --- シェーダー読み込みと主要オブジェクト生成 ---
async function loadAssetsAndSetupScene() {
    const [vertexShader, fragmentShader] = await Promise.all([
        fetch('./js/shaders/projection_vertex.glsl').then(res => res.text()),
        fetch('./js/shaders/projection_fragment.glsl').then(res => res.text()),
    ]);

    paperMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            projectionTexture: { value: null },
            projectorViewMatrix: { value: new THREE.Matrix4() },
            projectorProjectionMatrix: { value: new THREE.Matrix4() },
            u_isExporting: { value: false },
            u_paperModelMatrix: { value: new THREE.Matrix4() },
        },
        side: THREE.DoubleSide,
        transparent: true,
    });
    
    bakedMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
    });

    // 投影パラメータを操作するためのヘルパーオブジェクト
    const helperGeometry = new THREE.PlaneGeometry(1, 1);
    // マテリアルを画像表示用に変更
    const helperMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7 // 少し半透明にしておく
    });
    projectionHelper = new THREE.Mesh(helperGeometry, helperMaterial);
    projectionHelper.name = 'projectionHelper'; // Raycastでの識別のために名前を付ける
    projectionHelper.position.set(0, 3, 0);
    projectionHelper.rotation.x = -Math.PI / 4;
    scene.add(projectionHelper);
    
    projectorCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    scene.add(projectorCamera);
    const cameraHelper = new THREE.CameraHelper(projectorCamera);
    cameraHelper.name = "ProjectorFrustum";
    scene.add(cameraHelper);

    transformControls.attach(projectionHelper);
    
    updatePaperSize(40, 30);
}


// --- イベントリスナー設定 ---
function setupEventListeners() {
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('click', onClick); // クリックイベントを追加

    transformControls.addEventListener('dragging-changed', (event) => {
        orbitControls.enabled = !event.value;
    });

    transformControls.addEventListener('objectChange', () => {
        updateUIFromProjection(projectionHelper);
    });
}

// --- イベントハンドラ ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event) {
    switch (event.key.toLowerCase()) {
        case 'g':
            transformControls.setMode('translate');
            break;
        case 'r':
            transformControls.setMode('rotate');
            break;
        case 's':
            transformControls.setMode('scale');
            break;
        // case 'f': // Fキー機能を無効化
        //     toggleBakeMode();
        //     break;
        case 'h':
            const frustum = scene.getObjectByName("ProjectorFrustum");
            if (frustum) {
                frustum.visible = !frustum.visible;
                projectionHelper.visible = !projectionHelper.visible;
            }
            break;
    }
}

// クリック時のRaycasting処理
function onClick(event) {
    // UIパネル上でのクリックは無視する
    if (event.target.closest('#ui-panel')) {
        return;
    }

    // マウス座標を正規化デバイス座標(-1 to +1)に変換
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // カメラからマウスの位置に向かってRayを飛ばす
    raycaster.setFromCamera(mouse, camera);

    // 交差判定を行うオブジェクトのリスト
    const intersectableObjects = [foldedObject, projectionHelper];
    const intersects = raycaster.intersectObjects(intersectableObjects, true);

    if (intersects.length > 0) {
        // 何かに当たった場合
        const intersectedObject = intersects[0].object;

        // UIのセレクトボックスを取得
        const targetSelect = document.getElementById('transform-target');

        if (intersectedObject.name === 'projectionHelper') {
            transformControls.attach(projectionHelper);
            targetSelect.value = 'projection'; // UIを同期
        } else {
            // foldedObjectに当たった場合
            transformControls.attach(foldedObject);
            targetSelect.value = 'paper'; // UIを同期
        }
    } else {
        // 何にも当たらなかった場合 (背景をクリック)
        transformControls.detach();
    }
}


// --- コア機能 ---
function updatePaperSize(widthCm, heightCm) {
    if (foldedObject) scene.remove(foldedObject);
    const width = widthCm * CM_TO_UNIT_SCALE;
    const height = heightCm * CM_TO_UNIT_SCALE;
    const paperGeometry = new THREE.PlaneGeometry(width, height, 32, 32);
    foldedObject = new THREE.Mesh(paperGeometry, paperMaterial);
    scene.add(foldedObject);
    
    if (flatPaperObject) scene.remove(flatPaperObject);
    flatPaperObject = new THREE.Mesh(paperGeometry, bakedMaterial);
    flatPaperObject.visible = false; 
}

function loadTexture(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const loader = new THREE.TextureLoader();
        loader.load(e.target.result, (texture) => {
            projectionTexture = texture;
            paperMaterial.uniforms.projectionTexture.value = projectionTexture;
            
            // 投影ヘルパーのマテリアルにもテクスチャを設定
            projectionHelper.material.map = projectionTexture;
            projectionHelper.material.needsUpdate = true;

            projectionHelper.geometry.dispose();
            projectionHelper.geometry = new THREE.PlaneGeometry(
                texture.image.width / texture.image.height, 1
            );
        });
    };
    reader.readAsDataURL(file);
}

// Fキー機能は無効化
function toggleBakeMode() {
    isBakeMode = !isBakeMode;
    if (isBakeMode) {
        if (!projectionTexture) {
            alert("先に投影する画像ファイルを読み込んでください。");
            isBakeMode = false;
            return;
        }
        bakeProjectedTexture();
        
        foldedObject.visible = false;
        scene.add(flatPaperObject);
        flatPaperObject.visible = true;

        transformControls.detach();
    } else {
        foldedObject.visible = true;
        flatPaperObject.visible = false;
        scene.remove(flatPaperObject);

        const targetSelect = document.getElementById('transform-target');
        if (targetSelect.value === 'projection') {
            transformControls.attach(projectionHelper);
        } else {
            transformControls.attach(foldedObject);
        }
        paperMaterial.needsUpdate = true;
    }
}

function bakeProjectedTexture() {
    const renderTarget = new THREE.WebGLRenderTarget(2048, 2048);
    paperMaterial.uniforms.u_isExporting.value = true;
    const bakeScene = new THREE.Scene();
    const bakeCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    bakeCamera.position.z = 1;
    const tempPaper = new THREE.Mesh(flatPaperObject.geometry, paperMaterial);
    bakeScene.add(tempPaper);
    renderer.setRenderTarget(renderTarget);
    renderer.render(bakeScene, bakeCamera);
    renderer.setRenderTarget(null);
    paperMaterial.uniforms.u_isExporting.value = false;
    bakedMaterial.map = renderTarget.texture;
    bakedMaterial.needsUpdate = true;
    renderTarget.dispose();
}


// --- アニメーションループ ---
function animate() {
    requestAnimationFrame(animate);

    orbitControls.update();

    projectorCamera.position.copy(projectionHelper.position);
    projectorCamera.quaternion.copy(projectionHelper.quaternion);
    projectorCamera.scale.copy(projectionHelper.scale);

    const projectorViewMatrix = projectorCamera.matrixWorldInverse.clone();
    const projectorProjectionMatrix = projectorCamera.projectionMatrix.clone();

    paperMaterial.uniforms.projectorViewMatrix.value = projectorViewMatrix;
    paperMaterial.uniforms.projectorProjectionMatrix.value = projectorProjectionMatrix;
    
    if (foldedObject) {
        paperMaterial.uniforms.u_paperModelMatrix.value = foldedObject.matrixWorld;
    }

    renderer.render(scene, camera);
}

// --- 他モジュールへ渡すためのハンドル群 ---
function getAppHandles() {
    return {
        updatePaperSize,
        loadTexture,
        getProjectionHelper: () => projectionHelper,
        getFoldedObject: () => foldedObject,
        getTransformControls: () => transformControls,
        exportImage: () => {
            if (!projectionTexture) {
                alert("先に投影する画像ファイルを読み込んでください。");
                return;
            }
            exportHighResImage({
                renderer,
                paperMaterial,
                geometry: flatPaperObject.geometry,
                paperWidthCM: document.getElementById('paper-width').value,
                paperHeightCM: document.getElementById('paper-height').value,
                dpi: document.getElementById('export-dpi').value
            });
        }
    };
}

// --- アプリケーション起動 ---
init();