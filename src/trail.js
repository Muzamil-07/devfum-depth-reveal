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
    
    // Circle radius - increased for larger brush size
    this.circleRadius = width * 0.08;
    // Fade alpha - lower = slower fade, increased by 30% for faster reveal/unreveal
    this.fadeAlpha = 0.026;
    // Store previous mouse position for continuous line drawing
    this.prevMouse = null;
    // Track movement for randomization
    this.movementCounter = 0;
    this.lastMovementTime = 0;
  }
  
  // Helper function to create smooth radial gradient
  createSmoothGradient(x, y, radius = null) {
    const gradientRadius = radius !== null ? radius : this.circleRadius;
    const gradient = this.ctx.createRadialGradient(
      x, y, 0,
      x, y, gradientRadius
    );
    
    // Even smoother: smootherstep (Ken Perlin's improved version)
    const smootherstep = (t) => {
      t = Math.max(0, Math.min(1, t));
      return t * t * t * (t * (t * 6 - 15) + 10);
    };
    
    // Use many color stops for ultra-smooth transition
    const numStops = 100;
    const maxOpacity = 0.5; // Maximum opacity of the brush (50%)
    for (let i = 0; i <= numStops; i++) {
      const t = i / numStops;
      // Start fading very early (at 0.1) for extremely soft edge
      // Use smootherstep for the smoothest possible transition
      const fadeStart = 0.1;
      if (t < fadeStart) {
        gradient.addColorStop(t, `rgba(255, 255, 255, ${maxOpacity})`);
      } else {
        const fadeT = (t - fadeStart) / (1 - fadeStart);
        // Use smootherstep for ultra-smooth, soft falloff
        const opacity = maxOpacity * (1 - smootherstep(fadeT));
        gradient.addColorStop(t, `rgba(255, 255, 255, ${opacity})`);
      }
    }
    
    return gradient;
  }
  
  // Seeded random number generator - same seed = same random value
  seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
  
  // Draw an arbitrary random circle at a specific position
  // When moving: uses position + movement counter for variation
  // When stopped: uses only position for consistency
  drawRandomBrush(x, y, isMoving = true) {
    // Create base seed from position (quantized to grid for consistency)
    const gridSize = this.circleRadius * 0.3;
    const gridX = Math.floor(x / gridSize);
    const gridY = Math.floor(y / gridSize);
    const baseSeed = gridX * 73856093 + gridY * 19349663;
    
    // If moving, add movement counter for variation
    // If stopped, use only position for consistency
    const seed = isMoving ? baseSeed + this.movementCounter * 1000 : baseSeed;
    
    // Add extra position randomness when moving
    let baseX = x;
    let baseY = y;
    if (isMoving) {
      const r0 = this.seededRandom(seed + 9999);
      const r1 = this.seededRandom(seed + 9998);
      // Random offset to base position when moving (up to 60% of radius)
      const baseOffsetDistance = this.circleRadius * 0.6 * r0;
      const baseOffsetAngle = r1 * Math.PI * 2;
      baseX = x + Math.cos(baseOffsetAngle) * baseOffsetDistance;
      baseY = y + Math.sin(baseOffsetAngle) * baseOffsetDistance;
    }
    
    // Random number of circles (1-3)
    const r1 = this.seededRandom(seed);
    const numCircles = Math.floor(r1 * 3) + 1; // 1-3 circles
    
    for (let i = 0; i < numCircles; i++) {
      const circleSeed = seed + i * 10000;
      
      // Random circle properties
      const r2 = this.seededRandom(circleSeed + 1);
      const r3 = this.seededRandom(circleSeed + 2);
      const r4 = this.seededRandom(circleSeed + 3);
      const r5 = this.seededRandom(circleSeed + 4);
      
      // Random size (50% to 120% of base radius)
      const radius = this.circleRadius * (0.5 + r2 * 0.7);
      
      // Random offset from center - more random when moving
      const maxOffset = isMoving ? 0.8 : 0.4; // 80% when moving, 40% when stopped
      const offsetDistance = radius * maxOffset * r3;
      const offsetAngle = r4 * Math.PI * 2;
      const circleX = baseX + Math.cos(offsetAngle) * offsetDistance;
      const circleY = baseY + Math.sin(offsetAngle) * offsetDistance;
      
      // Draw the arbitrary circle
      const gradient = this.createSmoothGradient(circleX, circleY, radius);
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(circleX, circleY, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
  
  // Clear previous mouse position (call when mouse leaves canvas)
  clearMouse() {
    this.prevMouse = null;
  }
  
  update(mouse) {
    // Apply fade effect
    this.ctx.fillStyle = `rgba(0, 0, 0, ${this.fadeAlpha})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Only draw if mouse is provided, has valid coordinates, and is within canvas bounds
    // Reject invalid initial positions (like 0,0 or negative values that indicate uninitialized state)
    if (mouse && mouse.x !== undefined && mouse.y !== undefined && mouse.x >= 0 && mouse.y >= 0) {
      // Check if mouse is within canvas bounds
      const isWithinBounds = 
        mouse.x >= 0 && mouse.x <= this.canvas.width &&
        mouse.y >= 0 && mouse.y <= this.canvas.height;
      
      if (isWithinBounds) {
        // Check if mouse is moving (has moved significantly)
        let isMoving = false;
        if (this.prevMouse && 
            this.prevMouse.x >= 0 && this.prevMouse.x <= this.canvas.width &&
            this.prevMouse.y >= 0 && this.prevMouse.y <= this.canvas.height) {
          const dx = mouse.x - this.prevMouse.x;
          const dy = mouse.y - this.prevMouse.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Consider moving if distance is more than a small threshold
          isMoving = distance > 0.5;
          
          if (isMoving) {
            // Increment movement counter for variation while moving
            this.movementCounter++;
          }
          
          // Only interpolate if distance is reasonable (not a jump from invalid position)
          // Max reasonable distance is 2x the canvas diagonal (to handle fast but valid movement)
          const maxReasonableDistance = Math.sqrt(
            this.canvas.width * this.canvas.width + 
            this.canvas.height * this.canvas.height
          ) * 2;
          
          if (distance < maxReasonableDistance && distance > 0.5) {
            // If distance is large (fast movement), interpolate between positions
            // Draw random brushes along the path to create a continuous line
            const stepSize = this.circleRadius * 0.5; // Step size based on brush radius
            const numSteps = Math.max(1, Math.ceil(distance / stepSize));
            
            for (let i = 0; i <= numSteps; i++) {
              const t = i / numSteps;
              const x = this.prevMouse.x + dx * t;
              const y = this.prevMouse.y + dy * t;
              // Use random brush - isMoving is true since we're interpolating
              this.drawRandomBrush(x, y, true);
            }
          } else if (distance <= 0.5) {
            // Mouse hasn't moved much (stopped) - draw consistent shape
            // Reset movement counter so same position always has same shape
            this.movementCounter = 0;
            this.drawRandomBrush(mouse.x, mouse.y, false);
          } else {
            // Distance is too large, likely a jump from invalid position - just draw at current position
            this.drawRandomBrush(mouse.x, mouse.y, true);
          }
        } else {
          // First position or previous position was invalid, just draw a random brush at current position
          this.drawRandomBrush(mouse.x, mouse.y, true);
          this.movementCounter++;
        }
        
        // Update previous mouse position
        this.prevMouse = { x: mouse.x, y: mouse.y };
      } else {
        // Mouse is outside canvas bounds, clear previous position
        this.prevMouse = null;
      }
    } else {
      // No mouse data, clear previous position
      this.prevMouse = null;
    }
  }
  
  getTexture() {
    return this.canvas;
  }
}

