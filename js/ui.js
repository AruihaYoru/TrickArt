import * as THREE from 'three';

// --- グローバル変数 ---
// main.jsから受け取るアプリケーションのコア機能へのハンドル
let app; 

// --- DOM要素 ---
// 各UI要素への参照をまとめて取得
const uiElements = {
    paperWidth: document.getElementById('paper-width'),
    paperHeight: document.getElementById('paper-height'),
    imageLoader: document.getElementById('image-loader'),
    imagePreview: document.getElementById('image-preview'),
    transformTarget: document.getElementById('transform-target'),

    projPosX: document.getElementById('proj-pos-x'),
    projPosY: document.getElementById('proj-pos-y'),
    projPosZ: document.getElementById('proj-pos-z'),
    projPosXNum: document.getElementById('proj-pos-x-num'),
    projPosYNum: document.getElementById('proj-pos-y-num'),
    projPosZNum: document.getElementById('proj-pos-z-num'),

    projRotX: document.getElementById('proj-rot-x'),
    projRotY: document.getElementById('proj-rot-y'),
    projRotZ: document.getElementById('proj-rot-z'),
    projRotXNum: document.getElementById('proj-rot-x-num'),
    projRotYNum: document.getElementById('proj-rot-y-num'),
    projRotZNum: document.getElementById('proj-rot-z-num'),

    projScaleX: document.getElementById('proj-scale-x'),
    projScaleY: document.getElementById('proj-scale-y'),
    projScaleZ: document.getElementById('proj-scale-z'),
    projScaleXNum: document.getElementById('proj-scale-x-num'),
    projScaleYNum: document.getElementById('proj-scale-y-num'),
    projScaleZNum: document.getElementById('proj-scale-z-num'),
    
    exportButton: document.getElementById('export-button'),
    
    // ヘルプ
    helpOverlay: document.getElementById('help-overlay'),
    closeHelp: document.getElementById('close-help')
};

// スライダーと数値入力を同期させるためのマッピング
const sliderNumberMap = [
    { slider: uiElements.projPosX, number: uiElements.projPosXNum },
    { slider: uiElements.projPosY, number: uiElements.projPosYNum },
    { slider: uiElements.projPosZ, number: uiElements.projPosZNum },
    { slider: uiElements.projRotX, number: uiElements.projRotXNum },
    { slider: uiElements.projRotY, number: uiElements.projRotYNum },
    { slider: uiElements.projRotZ, number: uiElements.projRotZNum },
    { slider: uiElements.projScaleX, number: uiElements.projScaleXNum },
    { slider: uiElements.projScaleY, number: uiElements.projScaleYNum },
    { slider: uiElements.projScaleZ, number: uiElements.projScaleZNum },
];

// --- 初期化関数 ---
export function initUI(appHandles) {
    app = appHandles; // main.jsからのハンドルを保存

    // --- イベントリスナー設定 ---
    
    // 1. 用紙設定
    uiElements.paperWidth.addEventListener('change', updatePaper);
    uiElements.paperHeight.addEventListener('change', updatePaper);

    // 2. 画像読み込み
    uiElements.imageLoader.addEventListener('change', loadImage);
    
    // 3. 操作対象の切り替え
    uiElements.transformTarget.addEventListener('change', switchTransformTarget);

    // 4. 投影パラメータ（スライダーと数値入力）
    setupProjectionControls();
    
    // 5. エクスポートボタン
    uiElements.exportButton.addEventListener('click', () => app.exportImage());

    // 6. ヘルプ表示 (初回表示 & 閉じるボタン)
    // 初回訪問時にヘルプを表示 (localStorageで管理)
    if (!localStorage.getItem('anamorphosisGeneratorVisited')) {
        uiElements.helpOverlay.classList.add('visible');
        localStorage.setItem('anamorphosisGeneratorVisited', 'true');
    }
    uiElements.closeHelp.addEventListener('click', () => {
        uiElements.helpOverlay.classList.remove('visible');
    });

    // 初期値でUIを更新
    updateUIFromProjection(app.getProjectionHelper());
}

// --- イベントハンドラ ---

// 用紙サイズが変更されたとき
function updatePaper() {
    const width = parseFloat(uiElements.paperWidth.value);
    const height = parseFloat(uiElements.paperHeight.value);
    if (width > 0 && height > 0) {
        app.updatePaperSize(width, height);
    }
}

// 画像ファイルが選択されたとき
function loadImage(event) {
    const file = event.target.files[0];
    if (file) {
        app.loadTexture(file);
        
        // 画像プレビューの表示
        const reader = new FileReader();
        reader.onload = (e) => {
            uiElements.imagePreview.src = e.target.result;
            uiElements.imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

// 操作対象（投影/紙）が切り替えられたとき
function switchTransformTarget() {
    const targetValue = uiElements.transformTarget.value;
    const transformControls = app.getTransformControls();
    
    if (targetValue === 'projection') {
        transformControls.attach(app.getProjectionHelper());
    } else if (targetValue === 'paper') {
        transformControls.attach(app.getFoldedObject());
    }
}


// --- 投影パラメータUIのセットアップと更新 ---

// スライダーと数値入力のイベントリスナーをまとめて設定
function setupProjectionControls() {
    // 全てのポジションスライダー
    [uiElements.projPosX, uiElements.projPosY, uiElements.projPosZ].forEach(slider => {
        slider.addEventListener('input', updateProjectionFromUI);
    });
     [uiElements.projPosXNum, uiElements.projPosYNum, uiElements.projPosZNum].forEach(numInput => {
        numInput.addEventListener('change', updateProjectionFromUI);
    });
    
    // 全ての回転スライダー
    [uiElements.projRotX, uiElements.projRotY, uiElements.projRotZ].forEach(slider => {
        slider.addEventListener('input', updateProjectionFromUI);
    });
    [uiElements.projRotXNum, uiElements.projRotYNum, uiElements.projRotZNum].forEach(numInput => {
        numInput.addEventListener('change', updateProjectionFromUI);
    });

    // 全てのスケールスライダー
    [uiElements.projScaleX, uiElements.projScaleY, uiElements.projScaleZ].forEach(slider => {
        slider.addEventListener('input', updateProjectionFromUI);
    });
    [uiElements.projScaleXNum, uiElements.projScaleYNum, uiElements.projScaleZNum].forEach(numInput => {
        numInput.addEventListener('change', updateProjectionFromUI);
    });
    
    // スライダーと数値入力の値を双方向に同期させる
    sliderNumberMap.forEach(({ slider, number }) => {
        slider.addEventListener('input', () => number.value = slider.value);
        number.addEventListener('change', () => slider.value = number.value);
    });
}

// UIの入力値から3Dオブジェクト（projectionHelper）のトランスフォームを更新
function updateProjectionFromUI() {
    const projectionHelper = app.getProjectionHelper();
    if (!projectionHelper) return;

    // UIの値を取得
    const pos = {
        x: parseFloat(uiElements.projPosX.value),
        y: parseFloat(uiElements.projPosY.value),
        z: parseFloat(uiElements.projPosZ.value)
    };
    const rot = {
        x: parseFloat(uiElements.projRotX.value),
        y: parseFloat(uiElements.projRotY.value),
        z: parseFloat(uiElements.projRotZ.value)
    };
    const scale = {
        x: parseFloat(uiElements.projScaleX.value),
        y: parseFloat(uiElements.projScaleY.value),
        z: parseFloat(uiElements.projScaleZ.value)
    };

    // 3Dオブジェクトに適用 (cm -> 3D Unitに変換)
    const CM_TO_UNIT_SCALE = 0.1;
    projectionHelper.position.set(
        pos.x * CM_TO_UNIT_SCALE,
        pos.y * CM_TO_UNIT_SCALE,
        pos.z * CM_TO_UNIT_SCALE
    );
    projectionHelper.rotation.set(
        THREE.MathUtils.degToRad(rot.x),
        THREE.MathUtils.degToRad(rot.y),
        THREE.MathUtils.degToRad(rot.z)
    );
    projectionHelper.scale.set(
        scale.x,
        scale.y,
        scale.z
    );
}

// 3Dオブジェクト（projectionHelper）のトランスフォームをUIに反映
// (ギズモで操作したときに呼び出される)
export function updateUIFromProjection(projectionHelper) {
    if (!projectionHelper) return;
    
    const CM_TO_UNIT_SCALE = 0.1;

    // 位置 (3D Unit -> cmに変換)
    const pos = projectionHelper.position;
    uiElements.projPosX.value = (pos.x / CM_TO_UNIT_SCALE).toFixed(1);
    uiElements.projPosY.value = (pos.y / CM_TO_UNIT_SCALE).toFixed(1);
    uiElements.projPosZ.value = (pos.z / CM_TO_UNIT_SCALE).toFixed(1);

    // 回転 (radian -> degreeに変換)
    const rot = projectionHelper.rotation;
    uiElements.projRotX.value = THREE.MathUtils.radToDeg(rot.x).toFixed(0);
    uiElements.projRotY.value = THREE.MathUtils.radToDeg(rot.y).toFixed(0);
    uiElements.projRotZ.value = THREE.MathUtils.radToDeg(rot.z).toFixed(0);

    // スケール
    const scale = projectionHelper.scale;
    uiElements.projScaleX.value = scale.x.toFixed(2);
    uiElements.projScaleY.value = scale.y.toFixed(2);
    uiElements.projScaleZ.value = scale.z.toFixed(2);
    
    // スライダーと数値入力の値を同期
    sliderNumberMap.forEach(({ slider, number }) => {
        number.value = slider.value;
    });
}