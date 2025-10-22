// --- Uniforms (JavaScriptから渡される変数) ---
uniform sampler2D projectionTexture; // 投影する画像テクスチャ


// --- Varyings (頂点シェーダーから受け取る変数) ---
varying vec4 vProjectedCoords;


// --- main関数 ---
void main() {
    // 1. 投影座標系を正規化デバイス座標系(NDC)に変換
    // vProjectedCoordsは同次座標なので、w成分で割ることで-1.0から1.0の範囲に正規化する
    vec3 ndc = vProjectedCoords.xyz / vProjectedCoords.w;
    
    // 2. NDC座標(-1.0 ~ 1.0)をテクスチャUV座標(0.0 ~ 1.0)に変換
    vec2 uv = ndc.xy * 0.5 + 0.5;
    
    // 3. 投影範囲外のピクセルを破棄(discard)する
    // UV座標が0.0から1.0の範囲外であれば、そのピクセルは描画しない
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        discard;
    }
    
    // 4. 投影範囲内の場合、テクスチャから色を取得して出力
    vec4 projectedColor = texture2D(projectionTexture, uv);
    
    // もしテクスチャにアルファ値があれば、それを考慮する
    if (projectedColor.a < 0.1) {
        discard; // 透明に近い部分も描画しない
    }
    
    gl_FragColor = projectedColor;
}

// thank you Gemini2.5pro