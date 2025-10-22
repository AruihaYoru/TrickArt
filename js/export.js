import * as THREE from 'three';

/**
 * 指定されたDPIと物理寸法に基づき、高解像度の展開図画像を生成してダウンロードさせる関数
 * @param {object} options - エクスポート設定
 * @param {THREE.WebGLRenderer} options.renderer - レンダリングに使用するレンダラー
 * @param {THREE.ShaderMaterial} options.paperMaterial - プロジェクション用シェーダーマテリアル
 * @param {THREE.BufferGeometry} options.geometry - 描画対象の平坦なジオメトリ
 * @param {number} options.paperWidthCM - 用紙の物理的な幅 (cm)
 * @param {number} options.paperHeightCM - 用紙の物理的な高さ (cm)
 * @param {number} options.dpi - 出力解像度 (dots per inch)
 */
export function exportHighResImage(options) {
    const {
        renderer,
        paperMaterial,
        geometry,
        paperWidthCM,
        paperHeightCM,
        dpi
    } = options;

    console.log(`エクスポートを開始します: ${paperWidthCM}cm x ${paperHeightCM}cm @ ${dpi}DPI`);

    // --- 1. 出力解像度を計算 ---
    const INCH_TO_CM = 2.54;
    const outputWidth = Math.round((paperWidthCM / INCH_TO_CM) * dpi);
    const outputHeight = Math.round((paperHeightCM / INCH_TO_CM) * dpi);

    console.log(`出力解像度: ${outputWidth}px x ${outputHeight}px`);

    // --- 2. 高解像度用のWebGLRenderTargetを生成 ---
    const renderTarget = new THREE.WebGLRenderTarget(outputWidth, outputHeight, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
    });
    
    // --- 3. 高解像度でターゲットに描画 ---
    
    // 描画直前にシェーダーをベイク（エクスポート）モードに設定
    paperMaterial.uniforms.u_isExporting.value = true;

    // オフスクリーン描画用のシーンと正投影カメラをセットアップ
    const exportScene = new THREE.Scene();
    // 描画範囲がジオメトリ(-width/2 ~ +width/2)と完全に一致するようにカメラを設定
    const aspect = outputWidth / outputHeight;
    const paperWidthUnits = paperWidthCM * 0.1; // CM_TO_UNIT_SCALE
    const paperHeightUnits = paperHeightCM * 0.1;

    const exportCamera = new THREE.OrthographicCamera(
        -paperWidthUnits / 2, paperWidthUnits / 2,   // left, right
        paperHeightUnits / 2, -paperHeightUnits / 2,  // top, bottom
        0.1, 10
    );
    exportCamera.position.z = 1;

    // 描画対象のメッシュをシーンに追加
    const exportMesh = new THREE.Mesh(geometry, paperMaterial);
    exportScene.add(exportMesh);

    // 現在のRenderTargetを保存し、エクスポート用に切り替え
    const currentRenderTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(renderTarget);
    
    // 背景を白でクリア (透過PNGではなく白背景にする場合)
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    
    renderer.render(exportScene, exportCamera);
    
    // --- 後処理 ---
    // シェーダーのモードを元に戻す
    paperMaterial.uniforms.u_isExporting.value = false;
    // レンダラーのターゲットを元に戻す
    renderer.setRenderTarget(currentRenderTarget);
    // レンダラーのクリアカラーも元に戻す
    renderer.setClearColor(0x282c34, 1);

    // --- 4. ピクセルデータを読み出し、Canvas経由でPNGを生成 ---
    
    const pixelBuffer = new Uint8Array(outputWidth * outputHeight * 4);
    renderer.readRenderTargetPixels(
        renderTarget,
        0, 0,
        outputWidth, outputHeight,
        pixelBuffer
    );
    
    // ピクセルデータをHTML5 Canvasに描画
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    const imageData = new ImageData(new Uint8ClampedArray(pixelBuffer), outputWidth, outputHeight);
    context.putImageData(imageData, 0, 0);

    // --- 5. PNGとしてダウンロード ---
    const dataURL = canvas.toDataURL('image/png');
    
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'anamorphosis_export.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // --- メモリ解放 ---
    renderTarget.dispose();
    console.log("エクスポート完了。");
}