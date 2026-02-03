<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '@iconify/svelte';
  import { getLocalDateTimeString } from '../lib/util.ts'

  let stream: MediaStream | null = null; // ストリームを停止するために保持
  let video: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let width: number = 0, height: number = 0; // キャンバスのサイズ

  // ズーム・状態管理
  let zoomLevel: number = 1; // 1.0 to 3.0
  let offsetX: number = 0, offsetY: number = 0; // ずらし
  let isDragging: boolean = false;
  let lastMouseX: number = 0, lastMouseY: number = 0;
  let lastDist: number = 0;

  // カメラ・録画状態
  let isRecording: boolean = false;
  let mediaRecorder: MediaRecorder | null;
  let recordedChunks: Blob[] = [];
  let facingMode: string = 'user';
  let isAudioEnabled: boolean = true;

  // その他
  const iconSize: number = 32; // アイコンのサイズ

  onMount(async () => {
    let fMode = localStorage.getItem('SampleCamera_facingMode');
    if (fMode === 'user' || fMode === 'environment')
      facingMode = fMode;
    startCamera();
    return () => {
      if (window.animationFrameId) cancelAnimationFrame(window.animationFrameId);
    };
  });

  async function startCamera() {
    // 既存のストリームがあれば停止させる
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    ctx = canvas.getContext('2d');

    if (isAudioEnabled) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: true,
        });
      } catch (err) {
        isAudioEnabled = false;
      }
    }

    try {
      if (!isAudioEnabled) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: isAudioEnabled,
        });
      }

      // 実際のfacingModeを取得
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        let actualFacingMode = settings.facingMode || 'unknown';
        console.log("実際の動作モード:", actualFacingMode);
        localStorage.setItem('SampleCamera_facingMode', actualFacingMode);
        facingMode = actualFacingMode;
      }

      video.srcObject = stream;
      video.play();
      // 初回のみdrawを開始（既に動いている場合は何もしない）
      if (!window.animationFrameId) {
         const tick = () => {
           draw();
           window.animationFrameId = requestAnimationFrame(tick);
         };
         tick();
      }
    } catch (err) {
      console.error("カメラまたはマイクのアクセスに失敗しました:", err);
    }
  }

  // マイクのオンオフを切り替えてカメラを再起動
  async function toggleAudio() {
    isAudioEnabled = !isAudioEnabled;
    await startCamera();
  }

  // カメラを切り替える関数
  async function toggleCamera() {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    await startCamera();
  }

  function draw() {
    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
      // キャンバスサイズをビデオに合わせる
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const w = canvas.width;
      const h = canvas.height;

      // ズーム領域の計算
      const sw = w / zoomLevel;
      const sh = h / zoomLevel;
      const sx = (w - sw) / 2 + offsetX;
      const sy = (h - sh) / 2 + offsetY;

      // 1. カメラ映像を描画 (ズーム適用)
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);

      // 2. 日時を印字
      const timeStr = getLocalDateTimeString();
      ctx.font = `${w * 0.03}px monospace`;
      ctx.fillStyle = "#0f0";
      ctx.strokeStyle = "black";
      ctx.lineWidth = 3;
      // 右下にマージンを持って配置
      const margin = 8;
      ctx.textAlign = "right";
      ctx.strokeText(timeStr, w - margin, h - margin);
      ctx.fillText(timeStr, w - margin, h - margin);
    }
  }

  // 共通のパン位置補正関数
  function clampOffsets() {
    const maxOffX = (canvas.width - canvas.width / zoomLevel) / 2;
    const maxOffY = (canvas.height - canvas.height / zoomLevel) / 2;
    offsetX = Math.min(Math.max(offsetX, -maxOffX), maxOffX);
    offsetY = Math.min(Math.max(offsetY, -maxOffY), maxOffY);
  }

  // マウス/ドラッグ操作 (パン)
  function handleMouseDown(e: MouseEvent | TouchEvent) {
    if (zoomLevel > 1) {
      isDragging = true;
      lastMouseX = e.clientX || e.touches[0].clientX;
      lastMouseY = e.clientY || e.touches[0].clientY;
    }
  }

  function handleMouseMove(e: MouseEvent | TouchEvent) {
    // 1本指またはマウス左ボタンでのドラッグ
    if (isDragging && (!e.touches || e.touches.length === 1)) {
      const clientX = e.clientX || e.touches[0].clientX;
      const clientY = e.clientY || e.touches[0].clientY;
      
      const dx = (lastMouseX - clientX) * (1 / zoomLevel);
      const dy = (lastMouseY - clientY) * (1 / zoomLevel);

      offsetX += dx;
      offsetY += dy;

      // 範囲制限（映像の外に行き過ぎないように）
      const maxOffX = (canvas.width - canvas.width / zoomLevel) / 2;
      const maxOffY = (canvas.height - canvas.height / zoomLevel) / 2;
      offsetX = Math.min(Math.max(offsetX, -maxOffX), maxOffX);
      offsetY = Math.min(Math.max(offsetY, -maxOffY), maxOffY);

      lastMouseX = clientX;
      lastMouseY = clientY;
    }
  }

  function handleMouseUp() {
    isDragging = false;
  }

  // ピンチズーム処理
  function handleTouchMove(e: MouseEvent | TouchEvent) {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      if (lastDist > 0) {
        const delta = (dist - lastDist) / 100;
        zoomLevel = Math.min(Math.max(1, zoomLevel + delta), 3);

        // ピンチズーム時も端の隙間を補正
        clampOffsets();
      }
      lastDist = dist;
    }
  }

  function handleTouchEnd() {
    lastDist = 0;
  }

  // マウスホイールでのズーム処理
  function handleWheel(e: MouseEvent | TouchEvent) {
    // Ctrlキーが押されている場合のみズーム動作をさせる（一般的な挙動に合わせる）
    if (e.ctrlKey) {
      // e.deltaY は下スクロールで正、上スクロールで負の値
      // スクロール方向に応じてズーム倍率を増減
      const zoomSpeed = 0.002;
      const delta = -e.deltaY * zoomSpeed;

      // 1.0倍から3.0倍の間に制限 
      zoomLevel = Math.min(Math.max(1, zoomLevel + delta), 3);

      // ズームアウトしたときに端に隙間ができないよう補正
      clampOffsets();

      // 等倍に戻ったらパンもリセット
      if (zoomLevel === 1) {
        offsetX = 0;
        offsetY = 0;
      }
    }
  }

  // 写真撮影
  function takePhoto() {
    const dataUrl = canvas.toDataURL('image/jpeg');
    const link = document.createElement('a');
    link.download = `photo_${Date.now()}.jpg`;
    link.href = dataUrl;
    link.click();
  }

  // 動画撮影
  function toggleRecording() {
    if (!isRecording) {
      recordedChunks = [];

      // キャンバスから映像トラックを取得
      const canvasStream = canvas.captureStream(30);
      const videoTrack = canvasStream.getVideoTracks()[0];

      // マイクが有効な場合のみ音声トラックを探して追加
      const combinedStream = new MediaStream([videoTrack]);
      if (isAudioEnabled) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          combinedStream.addTrack(audioTrack);
        }
      }

      // 合成したストリームで録画開始
      mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
      mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `video_${Date.now()}.webm`;
        link.href = url;
        link.click();
      };
      mediaRecorder.start();
      isRecording = true;
    } else {
      mediaRecorder.stop();
      isRecording = false;
    }
  }
</script>

<main class="camera-container">
  <video bind:this={video} autoplay playsinline muted class="hidden"></video>

  <canvas
    bind:this={canvas}
    on:mousedown={handleMouseDown}
    on:touchstart={handleMouseDown}
    on:mousemove={handleMouseMove}
    on:touchmove={handleMouseMove}
    on:touchmove={handleTouchMove}
    on:mouseup={handleMouseUp}
    on:touchend={handleTouchEnd}
    on:wheel|preventDefault={handleWheel}
    class="preview-canvas"
    style="cursor: {zoomLevel > 1 ? 'move' : 'default'}"
  ></canvas>

  <div class="controls">
    <button on:click={toggleCamera} class="btn switchCamera">
      <Icon icon="solar:camera-rotate-linear" width={iconSize} />
      <span>カメラ切替</span>
    </button>

    <button on:click={takePhoto} class="btn photo">
      <Icon icon="solar:camera-linear" width={iconSize} />
      <span>写真撮影</span>
    </button>

    <button on:click={toggleRecording} class="btn video" class:recording={isRecording}>
      <Icon icon={isRecording ? "solar:stop-circle-linear" : "solar:videocamera-record-linear"} width={iconSize} />
      <span>{isRecording ? '停止' : '動画撮影'}</span>
    </button>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    background-color: #000;
    overflow: hidden;
  }

  .camera-container {
    position: relative;
    width: 100vw;
    width: 100dvw;
    height: 100vh;
    height: 100dvh;
    display: flex;
    justify-content: center;
    align-items: center;
    /* テキスト選択を無効化 */
    user-select: none;
    -webkit-user-select: none; /* Safari用 */
  }

  .hidden {
    display: none;
  }

  .preview-canvas {
    width: 100%;
    height: 100%;
    object-fit: contain; /* アスペクト比を維持して画面に収める */
    touch-action: none; /* ブラウザのデフォルトズームを無効化 */
  }

  .controls {
    position: absolute;
    bottom: 1vh;
    bottom: 1dvh;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 2vw;
    gap: 2dvw;
    padding: 0 5px;
  }

  .btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(10px);
    border: 2px solid black;
    color: black;
    font-weight: bold;
    padding: 6px 10px;
    border-radius: 12px;
    cursor: pointer;
    min-width: 5vw;
    min-width: 5dvw;
    transition: all 0.2s;
  }

  .btn span {
    font-size: 12px;
  }

  .btn:active {
    transform: scale(0.95);
    background: rgba(255, 255, 255, 0.4);
  }

  .recording {
    background: rgba(255, 0, 0, 0.5);
    border-color: #ff4d4d;
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.7; }
    100% { opacity: 1; }
  }
</style>