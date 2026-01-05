export default class TrailCanvas {
  constructor(width = 512, height = 512) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    
    this.ctx = this.canvas.getContext("2d");
    
    // Enable image smoothing for smoother rendering
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    
    // Fill with black background
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, width, height);
    
    // Circle radius is 10% of width
    this.circleRadius = width * 0.05;
    // Fade alpha - lower = slower fade
    this.fadeAlpha = 0.02;
  }
  
  update(mouse) {
    // Apply fade effect
    this.ctx.fillStyle = `rgba(0, 0, 0, ${this.fadeAlpha})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw white circle at mouse position with smooth gradient
    if (mouse && mouse.x !== undefined && mouse.y !== undefined) {
      // Create radial gradient for ultra-smooth edges with gradual falloff
      const gradient = this.ctx.createRadialGradient(
        mouse.x, mouse.y, 0,
        mouse.x, mouse.y, this.circleRadius
      );
      
      // Use smooth ease-out curve for ultra-smooth falloff
      // Ease-out function: 1 - (1 - t)^3 for smooth transition
      const easeOut = (t) => 1 - Math.pow(1 - t, 3);
      
      // Add many color stops for ultra-smooth transition
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const opacity = easeOut(1 - t); // Invert for fade-out effect
        gradient.addColorStop(t, `rgba(255, 255, 255, ${opacity})`);
      }
      
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(mouse.x, mouse.y, this.circleRadius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
  
  getTexture() {
    return this.canvas;
  }
}

