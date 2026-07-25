import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Spherical,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** 4方位ボタン。値は方位角(ラジアン) */
export const ANGLES: Record<string, number> = {
  まえ: 0,
  ななめ: Math.PI / 4,
  よこ: Math.PI / 2,
  うしろ: Math.PI,
};

const LOOK_AT_HEIGHT = 0.95; // キャラの胸あたりを注視
const CAMERA_DISTANCE = 2.6;

export class Stage {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly controls: OrbitControls;

  private tweenFrom = 0;
  private tweenTo = 0;
  private tweenStart = 0;
  private tweenDuration = 0;
  private tweening = false;
  private readonly tickers: ((dt: number) => void)[] = [];

  constructor(container: HTMLElement) {
    this.scene.background = new Color('#fdf6f9');

    this.camera = new PerspectiveCamera(45, 1, 0.1, 50);
    this.camera.position.set(0, LOOK_AT_HEIGHT + 0.35, CAMERA_DISTANCE);

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, LOOK_AT_HEIGHT, 0);
    this.controls.enablePan = false;
    // 真上・真下を向かせない
    this.controls.minPolarAngle = Math.PI * 0.25;
    this.controls.maxPolarAngle = Math.PI * 0.6;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 4.5;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;

    const hemi = new HemisphereLight('#ffffff', '#d8c8d8', 0.9);
    const key = new DirectionalLight('#ffffff', 1.6);
    key.position.set(1.5, 3, 2.5);
    const fill = new DirectionalLight('#ffe8f0', 0.5);
    fill.position.set(-2, 1.5, -2);
    this.scene.add(hemi, key, fill, new AmbientLight('#ffffff', 0.25));

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    new ResizeObserver(resize).observe(container);
    resize();

    let last = performance.now();
    this.renderer.setAnimationLoop((now) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      this.updateTween(now);
      this.controls.update();
      this.tickers.forEach((t) => t(dt));
      this.renderer.render(this.scene, this.camera);
    });
  }

  onTick(fn: (dt: number) => void): void {
    this.tickers.push(fn);
  }

  setBackground(hex: string): void {
    (this.scene.background as Color).set(hex);
  }

  /**
   * 現在の画を PNG の dataURL で取り出す。
   * preserveDrawingBuffer を有効にすると常時コストがかかるので、
   * 描画と読み出しを同じタスク内で連続させて回避する。
   */
  capture(maxWidth?: number, type = 'image/png'): string {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    if (!maxWidth || src.width <= maxWidth) return src.toDataURL(type);

    const scale = maxWidth / src.width;
    const canvas = document.createElement('canvas');
    canvas.width = maxWidth;
    canvas.height = Math.round(src.height * scale);
    canvas.getContext('2d')?.drawImage(src, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(type);
  }

  /** 一時的に正方形サイズで描画する(サムネイル生成用)。終わったら元に戻す */
  withSquare<T>(size: number, fn: () => T): T {
    const prevW = this.renderer.domElement.width;
    const prevH = this.renderer.domElement.height;
    const prevAspect = this.camera.aspect;
    const prevRatio = this.renderer.getPixelRatio();

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    try {
      return fn();
    } finally {
      this.renderer.setPixelRatio(prevRatio);
      this.renderer.setSize(prevW / prevRatio, prevH / prevRatio, false);
      this.camera.aspect = prevAspect;
      this.camera.updateProjectionMatrix();
    }
  }

  /** カメラをバウンディングボックスに合わせる(サムネイル生成用) */
  frameBox(box: Box3, azimuth = 0, padding = 1.25): void {
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = ((maxDim / 2) / Math.tan((this.camera.fov * Math.PI) / 360)) * padding;

    this.controls.target.copy(center);
    this.camera.position.set(
      center.x + Math.sin(azimuth) * dist,
      center.y + dist * 0.12,
      center.z + Math.cos(azimuth) * dist,
    );
    this.camera.lookAt(center);
    this.camera.updateMatrixWorld();
  }

  /** カメラ状態を保存して復元する */
  snapshotCamera(): () => void {
    const pos = this.camera.position.clone();
    const target = this.controls.target.clone();
    return () => {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.camera.lookAt(target);
    };
  }

  /** 現在の方位角(ラジアン) */
  get azimuth(): number {
    const sph = new Spherical().setFromVector3(
      new Vector3().subVectors(this.camera.position, this.controls.target),
    );
    return sph.theta;
  }

  /**
   * 方位角を指定角へ0.3秒で補間移動する。ライブラリ不要、lerpで十分。
   * 指を離しても正面へ勝手に戻すことはしない(子どもが決めた向きを尊重)。
   */
  moveToAzimuth(theta: number, duration = 300): void {
    this.tweenFrom = this.azimuth;
    // 最短方向に回す
    let delta = theta - this.tweenFrom;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.tweenTo = this.tweenFrom + delta;
    this.tweenStart = performance.now();
    this.tweenDuration = duration;
    this.tweening = true;
  }

  private updateTween(now: number): void {
    if (!this.tweening) return;
    const t = Math.min((now - this.tweenStart) / this.tweenDuration, 1);
    const eased = 1 - (1 - t) * (1 - t); // easeOutQuad
    const theta = this.tweenFrom + (this.tweenTo - this.tweenFrom) * eased;

    const offset = new Vector3().subVectors(this.camera.position, this.controls.target);
    const sph = new Spherical().setFromVector3(offset);
    sph.theta = theta;
    offset.setFromSpherical(sph);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);

    if (t >= 1) this.tweening = false;
  }
}
