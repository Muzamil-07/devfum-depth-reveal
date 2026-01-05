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
    
    // Circle radius is 10% of width (original size)
    this.circleRadius = width * 0.05;
    // Fade alpha - lower = slower fade
    this.fadeAlpha = 0.02;
  }
  
  update(mouse) {
    // Apply fade effect
    this.ctx.fillStyle = `rgba(0, 0, 0, ${this.fadeAlpha})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw white circle at mouse position with ultra-smooth gradient
    if (mouse && mouse.x !== undefined && mouse.y !== undefined) {
      // Create radial gradient - keep same radius but use softer falloff
      const gradient = this.ctx.createRadialGradient(
        mouse.x, mouse.y, 0,
        mouse.x, mouse.y, this.circleRadius
      );
      
      // Use ultra-smooth ease-out with higher power for very soft edges
      // Higher power = softer, more gradual fade
      const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
      
      // Add many more color stops for ultra-smooth transition (increased from 20 to 60)
      const numStops = 60;
      for (let i = 0; i <= numStops; i++) {
        const t = i / numStops;
        // Use ease-out quart for very soft, gradual fade
        // Start fading earlier (at 0.3) for softer edge
        const fadeStart = 0.3;
        if (t < fadeStart) {
          gradient.addColorStop(t, `rgba(255, 255, 255, 1.0)`);
        } else {
          const fadeT = (t - fadeStart) / (1 - fadeStart);
          const opacity = easeOutQuart(1 - fadeT);
          gradient.addColorStop(t, `rgba(255, 255, 255, ${opacity})`);
        }
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

