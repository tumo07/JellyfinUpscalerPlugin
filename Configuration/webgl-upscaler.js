// WebGL/WebGPU Client-Side Upscaling Shader
// Provides real-time video enhancement without server processing

(function() {
    'use strict';
    
    const WebGLUpscaler = {
        
        enabled: false,
        canvas: null,
        gl: null,
        program: null,
        texture: null,
        videoElement: null,
        animationFrameId: null,
        sharpness: 0.5,
        onFpsUpdate: null,
        _fpsFrameCount: 0,
        _fpsLastTime: 0,
        _explicitWidth: 0,
        _explicitHeight: 0,
        _texWidth: 0,
        _texHeight: 0,
        _hasRenderedFrame: false,
        _vertexShader: null,
        _fragmentShader: null,
        _uniformLocations: null,
        _positionBuffer: null,
        _texCoordBuffer: null,
        
        // Shader sources
        vertexShaderSource: `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `,
        
        // Pure 36-tap (6x6) Lanczos3 Sinc Reconstruction + AMD Contrast Adaptive Sharpening (CAS)
        // Mathematically exact sub-pixel positioning: zero phase shift, zero smearing, pristine anime lines
        fragmentShaderSource: `
            precision highp float;

            uniform sampler2D u_texture;
            uniform vec2 u_resolution;  // source (video) dimensions in pixels
            uniform float u_sharpness;  // CAS sharpness slider (0.0 to 1.0)
            varying vec2 v_texCoord;

            #define PI 3.14159265358979323846

            // Normalized sinc function: sinc(x) = sin(pi * x) / (pi * x), with sinc(0) = 1
            float sinc(float x) {
                float px = PI * x;
                if (abs(px) < 1e-4) return 1.0;
                return sin(px) / px;
            }

            // 3-lobed Lanczos window function (radius = 3.0, support = [-3.0, 3.0])
            float lanczos3(float x) {
                float ax = abs(x);
                if (ax >= 3.0) return 0.0;
                return sinc(x) * sinc(x / 3.0);
            }

            // Reconstruct sub-pixel sample using 36-tap (6x6) separable Lanczos3 sinc interpolation
            // with soft anti-ringing bounded by the local 2x2 quad to prevent halos on anime line art.
            vec3 lanczos3Resample(vec2 uv, vec2 srcTexelSize) {
                // Map continuous normalized UV to source pixel coordinate
                vec2 pos = uv * u_resolution;
                vec2 baseTexel = floor(pos - 0.5);
                vec2 f = pos - (baseTexel + 0.5); // Fractional offset from baseTexel center in [-0.5, 0.5)

                // Sample the immediate 2x2 bounding quad around pos for anti-ringing bounds
                vec3 c00 = texture2D(u_texture, (baseTexel + vec2(0.5, 0.5)) * srcTexelSize).rgb;
                vec3 c10 = texture2D(u_texture, (baseTexel + vec2(1.5, 0.5)) * srcTexelSize).rgb;
                vec3 c01 = texture2D(u_texture, (baseTexel + vec2(0.5, 1.5)) * srcTexelSize).rgb;
                vec3 c11 = texture2D(u_texture, (baseTexel + vec2(1.5, 1.5)) * srcTexelSize).rgb;
                vec3 minQuad = min(min(c00, c10), min(c01, c11));
                vec3 maxQuad = max(max(c00, c10), max(c01, c11));

                vec3 color = vec3(0.0);
                float totalWeight = 0.0;

                // 6x6 = 36-tap separable sinc evaluation with exact distances (f - offset)
                for (int j = -2; j <= 3; j++) {
                    float dy = f.y - float(j);
                    float wy = lanczos3(dy);
                    float sampleY = (baseTexel.y + float(j) + 0.5) * srcTexelSize.y;

                    for (int i = -2; i <= 3; i++) {
                        float dx = f.x - float(i);
                        float w = wy * lanczos3(dx);
                        float sampleX = (baseTexel.x + float(i) + 0.5) * srcTexelSize.x;

                        vec3 s = texture2D(u_texture, vec2(sampleX, sampleY)).rgb;
                        color += s * w;
                        totalWeight += w;
                    }
                }

                vec3 res = (totalWeight > 1e-4) ? (color / totalWeight) : c00;
                // Soft anti-ringing: clamp excessive ringing while preserving natural edge sharpness
                vec3 clamped = clamp(res, minQuad, maxQuad);
                return mix(clamped, clamp(res, 0.0, 1.0), 0.35);
            }

            // AMD FidelityFX Contrast Adaptive Sharpening (CAS) pass
            vec3 casSharpening(vec2 uv, vec3 center, vec2 srcTexelSize, float strength) {
                vec2 halfStep = srcTexelSize * 0.5;
                vec3 n = texture2D(u_texture, uv + vec2(0.0, -halfStep.y)).rgb;
                vec3 s = texture2D(u_texture, uv + vec2(0.0,  halfStep.y)).rgb;
                vec3 e = texture2D(u_texture, uv + vec2( halfStep.x, 0.0)).rgb;
                vec3 w = texture2D(u_texture, uv + vec2(-halfStep.x, 0.0)).rgb;

                vec3 minRGB = min(center, min(min(n, s), min(e, w)));
                vec3 maxRGB = max(center, max(max(n, s), max(e, w)));

                // Adaptive sharpening weight based on local contrast
                vec3 d = 1.0 / (maxRGB - minRGB + 0.05);
                d = clamp(d * (-0.125), -0.125, 0.0);
                float peak = mix(-0.125, -0.04, strength);
                d = max(d, vec3(peak));

                vec3 result = (center + (n + s + e + w) * d) / (1.0 + 4.0 * d);
                return clamp(result, 0.0, 1.0);
            }

            void main() {
                if (u_resolution.x < 1.0 || u_resolution.y < 1.0) {
                    gl_FragColor = texture2D(u_texture, v_texCoord);
                    return;
                }
                vec2 srcTexelSize = 1.0 / u_resolution;
                vec3 color = lanczos3Resample(v_texCoord, srcTexelSize);

                if (u_sharpness > 0.01) {
                    color = casSharpening(v_texCoord, color, srcTexelSize, u_sharpness);
                }

                gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
            }
        `,
        
        // Initialize WebGL context
        init: function(videoElement) {
            try {
                console.log('AI Upscaler: Initializing WebGL upscaler...');
                
                this.videoElement = videoElement;
                this._texWidth = 0;
                this._texHeight = 0;
                this._hasRenderedFrame = false;
                
                // Create canvas overlay
                this.canvas = document.createElement('canvas');
                this.canvas.id = 'aiUpscalerCanvas';
                this.canvas.style.position = 'absolute';
                this.canvas.style.top = '0';
                this.canvas.style.left = '0';
                this.canvas.style.width = '100%';
                this.canvas.style.height = '100%';
                this.canvas.style.objectFit = 'contain';
                this.canvas.style.pointerEvents = 'none';
                this.canvas.style.zIndex = '999';
                
                // Get WebGL context with optimal video playback flags (alpha: false avoids compositor blackhole)
                var ctxAttribs = {
                    alpha: false,
                    depth: false,
                    stencil: false,
                    antialias: false,
                    premultipliedAlpha: false,
                    preserveDrawingBuffer: false,
                    powerPreference: 'high-performance'
                };
                this.gl = this.canvas.getContext('webgl2', ctxAttribs) || 
                          this.canvas.getContext('webgl', ctxAttribs) ||
                          this.canvas.getContext('experimental-webgl', ctxAttribs);
                
                if (!this.gl) {
                    console.error('AI Upscaler: WebGL not supported');
                    return false;
                }
                
                // Compile shaders
                if (!this.compileShaders()) {
                    console.error('AI Upscaler: Failed to compile shaders');
                    return false;
                }
                
                // Setup geometry
                this.setupGeometry();
                
                // Insert canvas into video container
                const videoContainer = videoElement.parentElement;
                if (videoContainer) {
                    videoContainer.style.position = 'relative';
                    videoContainer.appendChild(this.canvas);
                }
                
                // Handle WebGL context loss and restoration
                this.canvas.addEventListener('webglcontextlost', function(e) {
                    e.preventDefault();
                    console.warn('AI Upscaler: WebGL context lost');
                    WebGLUpscaler.disable();
                }, false);

                this.canvas.addEventListener('webglcontextrestored', function() {
                    console.log('AI Upscaler: WebGL context restored, reinitializing...');
                    var rAttribs = {
                        alpha: false,
                        depth: false,
                        stencil: false,
                        antialias: false,
                        premultipliedAlpha: false,
                        preserveDrawingBuffer: false,
                        powerPreference: 'high-performance'
                    };
                    WebGLUpscaler.gl = WebGLUpscaler.canvas.getContext('webgl2', rAttribs) || 
                                       WebGLUpscaler.canvas.getContext('webgl', rAttribs) ||
                                       WebGLUpscaler.canvas.getContext('experimental-webgl', rAttribs);
                    if (WebGLUpscaler.gl && WebGLUpscaler.compileShaders()) {
                        WebGLUpscaler.setupGeometry();
                        WebGLUpscaler._texWidth = 0;
                        WebGLUpscaler._texHeight = 0;
                        WebGLUpscaler._hasRenderedFrame = false;
                        console.log('AI Upscaler: WebGL context restored successfully');
                    }
                }, false);

                console.log('AI Upscaler: WebGL upscaler initialized successfully');
                return true;
                
            } catch (error) {
                console.error('AI Upscaler: Initialization failed:', error);
                return false;
            }
        },
        
        // Compile shaders
        compileShaders: function() {
            const gl = this.gl;
            
            // Vertex shader
            this._vertexShader = gl.createShader(gl.VERTEX_SHADER);
            gl.shaderSource(this._vertexShader, this.vertexShaderSource);
            gl.compileShader(this._vertexShader);

            if (!gl.getShaderParameter(this._vertexShader, gl.COMPILE_STATUS)) {
                console.error('Vertex shader error:', gl.getShaderInfoLog(this._vertexShader));
                return false;
            }

            // Fragment shader
            this._fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(this._fragmentShader, this.fragmentShaderSource);
            gl.compileShader(this._fragmentShader);

            if (!gl.getShaderParameter(this._fragmentShader, gl.COMPILE_STATUS)) {
                console.error('Fragment shader error:', gl.getShaderInfoLog(this._fragmentShader));
                return false;
            }

            // Link program
            this.program = gl.createProgram();
            gl.attachShader(this.program, this._vertexShader);
            gl.attachShader(this.program, this._fragmentShader);
            gl.linkProgram(this.program);
            
            if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
                console.error('Program link error:', gl.getProgramInfoLog(this.program));
                return false;
            }

            // Cache uniform locations once (avoids per-frame GPU roundtrips)
            this._uniformLocations = {
                resolution: gl.getUniformLocation(this.program, 'u_resolution'),
                sharpness: gl.getUniformLocation(this.program, 'u_sharpness'),
                texture: gl.getUniformLocation(this.program, 'u_texture')
            };

            return true;
        },
        
        // Setup geometry buffers
        setupGeometry: function() {
            const gl = this.gl;
            
            // Full-screen quad
            const positions = new Float32Array([
                -1, -1,
                 1, -1,
                -1,  1,
                 1,  1
            ]);
            
            const texCoords = new Float32Array([
                0, 1,
                1, 1,
                0, 0,
                1, 0
            ]);
            
            // Position buffer
            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
            
            const positionLocation = gl.getAttribLocation(this.program, 'a_position');
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
            
            // Texture coordinate buffer
            const texCoordBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
            
            const texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');
            gl.enableVertexAttribArray(texCoordLocation);
            gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

            // Store buffer references for cleanup
            this._positionBuffer = positionBuffer;
            this._texCoordBuffer = texCoordBuffer;

            // Create texture
            this.texture = gl.createTexture();
            this._texWidth = 0;
            this._texHeight = 0;
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        },
        
        _scheduleNextFrame: function() {
            if (!this.enabled) return;
            const video = this.videoElement;
            if (video && typeof video.requestVideoFrameCallback === 'function') {
                this._usingRvfc = true;
                this.animationFrameId = video.requestVideoFrameCallback(() => this.render());
            } else {
                this._usingRvfc = false;
                this.animationFrameId = requestAnimationFrame(() => this.render());
            }
        },

        // Render frame
        render: function() {
            if (!this.enabled || !this.gl || this.gl.isContextLost()) {
                return;
            }

            // Always reschedule next frame FIRST synced with video frame presentation
            this._scheduleNextFrame();

            const video = this.videoElement;
            if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || video.paused || video.ended) {
                // If video is buffering or stopped, ensure native video is visible
                if (!this._hasRenderedFrame && video && video.style.opacity === '0') {
                    video.style.opacity = '1';
                }
                return;
            }

            const gl = this.gl;
            
            // Adaptive target: scale up to 2x integer or match the screen display resolution
            // Prevents rendering 4K (8.3M pixels) on a 1080p office screen which overwhelms integrated GPUs
            var targetW, targetH;
            if (this._explicitWidth && this._explicitHeight) {
                targetW = this._explicitWidth;
                targetH = this._explicitHeight;
            } else {
                var dpr = window.devicePixelRatio || 1;
                var displayW = Math.round((this.canvas.clientWidth || window.innerWidth || video.videoWidth) * dpr);
                var displayH = Math.round((this.canvas.clientHeight || window.innerHeight || video.videoHeight) * dpr);
                var maxW = Math.max(video.videoWidth, displayW);
                var maxH = Math.max(video.videoHeight, displayH);

                var scale = (video.videoHeight >= 2160) ? 1.0 : 2.0;
                targetW = Math.min(video.videoWidth * scale, maxW);
                targetH = Math.min(video.videoHeight * scale, maxH);
            }
            
            if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
                this.canvas.width = targetW;
                this.canvas.height = targetH;
                gl.viewport(0, 0, targetW, targetH);
            }

            // Sync aspect ratio: preserve 4:3 with contain, unless user explicitly set fill/cover on video
            var vidFit = video.style.objectFit;
            var fit = (vidFit === 'fill' || vidFit === 'cover') ? vidFit : 'contain';
            if (this.canvas.style.objectFit !== fit) {
                this.canvas.style.objectFit = fit;
            }
            if (this.canvas.style.width !== '100%') this.canvas.style.width = '100%';
            if (this.canvas.style.height !== '100%') this.canvas.style.height = '100%';
            if (this.canvas.style.position !== 'absolute') this.canvas.style.position = 'absolute';
            
            // Explicitly bind Texture Unit 0
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            
            // Fast texture upload using RGBA (crucial for Intel UHD / D3D11 / ANGLE hardware video decoding)
            try {
                if (this._texWidth !== video.videoWidth || this._texHeight !== video.videoHeight) {
                    this._texWidth = video.videoWidth;
                    this._texHeight = video.videoHeight;
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                } else {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
                }
            } catch (uploadErr) {
                // If sub-image fails due to driver state or dimension mismatch, allocate fresh texture storage
                this._texWidth = video.videoWidth;
                this._texHeight = video.videoHeight;
                try {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
                } catch (allocErr) {
                    return; // Wait for next frame
                }
            }
            
            // Use shader program
            gl.useProgram(this.program);
            
            // Set uniforms (using cached locations)
            if (this._uniformLocations.texture) {
                gl.uniform1i(this._uniformLocations.texture, 0);
            }
            gl.uniform2f(this._uniformLocations.resolution, video.videoWidth, video.videoHeight);
            gl.uniform1f(this._uniformLocations.sharpness, this.sharpness);

            // Draw
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            this._hasRenderedFrame = true;

            // Ensure native video is hidden only once upscaled canvas is actively drawing
            if (video.style.opacity !== '0') {
                video.style.opacity = '0';
            }

            // FPS tracking
            this._fpsFrameCount++;
            var now = performance.now();
            if (now - this._fpsLastTime >= 1000) {
                var fps = Math.round(this._fpsFrameCount * 1000 / (now - this._fpsLastTime));
                this._fpsFrameCount = 0;
                this._fpsLastTime = now;
                if (typeof this.onFpsUpdate === 'function') {
                    this.onFpsUpdate(fps);
                }
            }
        },
        
        // Enable upscaling
        enable: function() {
            if (!this.canvas || !this.gl) {
                console.error('AI Upscaler: WebGL not initialized');
                return;
            }

            this.enabled = true;
            this._fpsLastTime = performance.now();
            this._fpsFrameCount = 0;
            this.canvas.style.display = 'block';
            this.render();
            
            console.log('AI Upscaler: WebGL upscaling enabled');
        },
        
        // Disable upscaling
        disable: function() {
            this.enabled = false;
            this._hasRenderedFrame = false;
            
            if (this.canvas) {
                this.canvas.style.display = 'none';
            }
            
            if (this.videoElement) {
                this.videoElement.style.opacity = '1';
            }
            
            if (this.animationFrameId) {
                if (this._usingRvfc && this.videoElement && typeof this.videoElement.cancelVideoFrameCallback === 'function') {
                    try { this.videoElement.cancelVideoFrameCallback(this.animationFrameId); } catch (e) {}
                } else {
                    cancelAnimationFrame(this.animationFrameId);
                }
                this.animationFrameId = null;
            }
            
            console.log('AI Upscaler: WebGL upscaling disabled');
        },
        
        // Toggle upscaling
        toggle: function() {
            if (this.enabled) {
                this.disable();
            } else {
                this.enable();
            }
        },
        
        // Set sharpness (0.0 to 1.0)
        setSharpness: function(value) {
            this.sharpness = Math.max(0, Math.min(1, value));
        },

        // Set explicit canvas output size (0 = use video native)
        setCanvasSize: function(w, h) {
            this._explicitWidth = w || 0;
            this._explicitHeight = h || 0;
        },

        // Cleanup
        destroy: function() {
            this.disable();
            
            if (this.canvas && this.canvas.parentElement) {
                this.canvas.parentElement.removeChild(this.canvas);
            }
            
            if (this.gl) {
                if (this._positionBuffer) this.gl.deleteBuffer(this._positionBuffer);
                if (this._texCoordBuffer) this.gl.deleteBuffer(this._texCoordBuffer);
                if (this.texture) this.gl.deleteTexture(this.texture);
                if (this._vertexShader) this.gl.deleteShader(this._vertexShader);
                if (this._fragmentShader) this.gl.deleteShader(this._fragmentShader);
                if (this.program) this.gl.deleteProgram(this.program);
            }

            this.canvas = null;
            this.gl = null;
            this.program = null;
            this.texture = null;
            this._positionBuffer = null;
            this._texCoordBuffer = null;
            this._vertexShader = null;
            this._fragmentShader = null;
            this.videoElement = null;
            this._texWidth = 0;
            this._texHeight = 0;
            this._explicitWidth = 0;
            this._explicitHeight = 0;
            this._hasRenderedFrame = false;
        }
    };
    
    // Export to global scope
    window.AIUpscalerWebGL = WebGLUpscaler;
    
    console.log('AI Upscaler: WebGL shader module loaded');
})();
