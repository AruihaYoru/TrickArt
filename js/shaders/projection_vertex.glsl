// --- Uniforms ---
uniform mat4 projectorViewMatrix;
uniform mat4 projectorProjectionMatrix;
uniform bool u_isExporting;
uniform mat4 u_paperModelMatrix; // JSから渡される、紙オブジェクトの正しいワールド行列

// --- Varyings ---
varying vec4 vProjectedCoords;

void main() {
    // --- 常に「折り曲げられた状態」のローカル座標を計算しておく ---
    float foldAngle = 45.0 * (3.1415926535 / 180.0);
    float x_from_center = position.x;
    float bent_x = abs(x_from_center) * cos(foldAngle);
    float bent_z = abs(x_from_center) * sin(foldAngle);
    bent_x *= sign(x_from_center);
    vec4 bentLocalPosition = vec4(bent_x, position.y, bent_z, 1.0);

    // --- 1. 最終的な描画位置 (gl_Position) の計算 ---
    vec4 finalLocalPosition;
    if (u_isExporting) {
        // エクスポート時：平らなままの座標を使う
        finalLocalPosition = vec4(position, 1.0);
    } else {
        // ライブビュー時：計算した「折り曲げられた座標」を使う
        finalLocalPosition = bentLocalPosition;
    }
    // ここで使う modelMatrix は、Three.jsが描画コンテキストに応じて渡してくるもの
    vec4 worldPositionForRender = modelMatrix * finalLocalPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPositionForRender;

    // --- 2. プロジェクション座標 (vProjectedCoords) の計算 ---
    // ここで使うのは、JSから明示的に渡された正しい u_paperModelMatrix
    vec4 worldPositionForProjection = u_paperModelMatrix * bentLocalPosition;
    vProjectedCoords = projectorProjectionMatrix * projectorViewMatrix * worldPositionForProjection;
}

// thank you Gemini2.5pro