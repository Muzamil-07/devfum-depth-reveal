export default class TrailCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  circleRadius: number;
  fadeAlpha: number;
  
  constructor(width?: number, height?: number);
  update(mouse: { x: number; y: number }): void;
  getTexture(): HTMLCanvasElement;
}

