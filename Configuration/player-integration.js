// AI Upscaler Plugin - Player Integration v1.7.13
// Global script injection (loaded via index.html like Intro Skipper)
// Compatible with Jellyfin 10.11+

(function() {
    'use strict';

    // Plugin configuration
    const PLUGIN_ID = 'f87f700e-679d-43e6-9c7c-b3a410dc3f22';
    const PLUGIN_VERSION = '1.8.3.54';

    // Prevent double-init
    if (window._aiUpscalerLoaded) return;
    window._aiUpscalerLoaded = true;

    // v1.8.3.35 - the engine scripts load relative to the web client, like the tag in
    // index.html. An absolute "/web/..." path drops a configured base URL, and Jellyfin
    // answers that with a redirect to its start page, so behind a base URL the Lanczos,
    // Anime4K and WebGPU engines never loaded. The release query fetches them anew after
    // an update, as the index.html tag does for this script.
    function pluginScriptUrl(name) {
        return 'configurationpage?name=' + name + '&release=' + PLUGIN_VERSION;
    }

    // All available models grouped by category (synced with Python AVAILABLE_MODELS)
    const MODEL_CATALOG = {
        realesrgan: {
            label: 'Real-ESRGAN',
            desc: 'Best Quality (ONNX)',
            models: [
                { id: 'realesrgan-x4', name: 'Real-ESRGAN x4', scale: 4, badge: 'Best' },
                { id: 'realesrgan-x4-256', name: 'Real-ESRGAN x4 (256px)', scale: 4, badge: 'Low VRAM' }
            ]
        },
        nextgen: {
            label: 'Next-Gen',
            desc: 'Modern Architectures (ONNX)',
            models: [
                { id: 'span-x2', name: 'SPAN x2', scale: 2, badge: 'Fast Quality' },
                { id: 'span-x4', name: 'SPAN x4', scale: 4 },
                { id: 'realesrgan-x2-plus', name: 'Real-ESRGAN x2+', scale: 2 },
                { id: 'realesrgan-animevideo-x4', name: 'Real-ESRGAN AnimeVideo x4', scale: 4 },
                { id: 'swinir-x4', name: 'SwinIR x4', scale: 4 },
                { id: 'apisr-x3', name: 'APISR x3', scale: 3 }
            ]
        },
        'video-fast': {
            label: 'Video Real-Time',
            desc: 'Ultra-Fast for Playback',
            models: [
                { id: 'gpu-fast-x2', name: 'GPU Real-Time 2x (60 FPS)', scale: 2, badge: '60 FPS' },
                { id: 'clearreality-x4', name: 'ClearReality x4', scale: 4, badge: 'Ultra-Fast' },
                { id: 'nomosuni-compact-x2', name: 'NomosUni Compact x2', scale: 2 },
                { id: 'lsdir-compact-x4', name: 'LSDIR Compact x4', scale: 4 },
                { id: 'swinir-small-x2', name: 'SwinIR-S x2', scale: 2 },
                { id: 'swinir-small-x4', name: 'SwinIR-S x4', scale: 4 }
            ]
        },
        'video-quality': {
            label: 'Video Quality',
            desc: 'Best Single-Frame for Video',
            models: [
                { id: 'ultrasharp-v2-x4', name: 'UltraSharp V2 x4', scale: 4, badge: 'Best Photo/Video' },
                { id: 'nomos2-dat2-x4', name: 'Nomos2 DAT2 x4', scale: 4 },
                { id: 'nomos2-realplksr-x4', name: 'Nomos2 RealPLKSR x4', scale: 4 }
            ]
        },
        'film-restore': {
            label: 'Film Restoration',
            desc: 'Old Movies, DVDs, VHS',
            models: [
                { id: 'fsdedither-x4', name: 'FSDedither x4', scale: 4 },
                { id: 'nomos8k-hat-x4', name: 'Nomos8k HAT-S x4', scale: 4 }
            ]
        },
        anime: {
            label: 'Anime',
            desc: 'Anime Specialist',
            models: [
                { id: 'anime-compact-x4', name: 'Real-ESRGAN Anime Compact x4', scale: 4, badge: 'Fast Anime' },
                { id: 'apisr-anime-x2', name: 'APISR x2 Anime', scale: 2 }
            ]
        },
        'video-sr': {
            label: 'Video SR',
            desc: 'Multi-Frame (Best Batch Quality)',
            models: [
                { id: 'edvr-m-x4', name: 'EDVR-M x4 (5 Frame)', scale: 4 },
                { id: 'realbasicvsr-x4', name: 'RealBasicVSR x4 (5 Frame)', scale: 4 },
                { id: 'animesr-v2-x4', name: 'AnimeSR v2 x4 (5 Frame)', scale: 4 }
            ]
        },
        edsr: {
            label: 'EDSR',
            desc: 'High Quality (OpenCV)',
            models: [
                { id: 'edsr-x2', name: 'EDSR x2', scale: 2 },
                { id: 'edsr-x3', name: 'EDSR x3', scale: 3 },
                { id: 'edsr-x4', name: 'EDSR x4', scale: 4 }
            ]
        },
        lapsrn: {
            label: 'LapSRN',
            desc: 'Good Quality (OpenCV)',
            models: [
                { id: 'lapsrn-x2', name: 'LapSRN x2', scale: 2 },
                { id: 'lapsrn-x4', name: 'LapSRN x4', scale: 4 },
                { id: 'lapsrn-x8', name: 'LapSRN x8', scale: 8 }
            ]
        },
        fsrcnn: {
            label: 'FSRCNN',
            desc: 'Fast (OpenCV)',
            models: [
                { id: 'fsrcnn-x2', name: 'FSRCNN x2', scale: 2 },
                { id: 'fsrcnn-x3', name: 'FSRCNN x3', scale: 3 },
                { id: 'fsrcnn-x4', name: 'FSRCNN x4', scale: 4 }
            ]
        },
        espcn: {
            label: 'ESPCN',
            desc: 'Fastest (OpenCV)',
            models: [
                { id: 'espcn-x2', name: 'ESPCN x2', scale: 2 },
                { id: 'espcn-x3', name: 'ESPCN x3', scale: 3 },
                { id: 'espcn-x4', name: 'ESPCN x4', scale: 4 }
            ]
        },
        vulkan: {
            label: 'Vulkan GPU',
            desc: 'ncnn (AMD/Intel)',
            models: [
                { id: 'ncnn-realesrgan-x4', name: 'Real-ESRGAN x4 (Vulkan)', scale: 4 },
                { id: 'ncnn-realesrgan-anime-x4', name: 'Real-ESRGAN Anime x4 (Vulkan)', scale: 4 },
                { id: 'ncnn-realesrgan-anime-x2', name: 'Real-ESRGAN Anime x2 (Vulkan)', scale: 2 },
                { id: 'ncnn-realsr-x4', name: 'RealSR x4 (Vulkan)', scale: 4 }
            ]
        }
    };

    // \u2500\u2500 v1.6.1.13: Live filter overlay (CSS filter on <video>) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    //
    // Client-side only - each preset maps to a CSS `filter` string applied directly
    // to the playing <video> element. No transcode, no AI service. FFmpeg presets
    // in VideoFilterService.cs are visually close but not pixel-identical: CSS can't
    // express curves / LUTs / vignette / film grain. Those live in the Advanced pane
    // and apply via the server filter chain on next seek.
    const PRESET_CSS = {
        'none':        '',
        'cinematic':   'brightness(0.96) contrast(1.25) saturate(1.15)',
        'vintage':     'contrast(1.1) saturate(0.65) sepia(0.3)',
        'vivid':       'contrast(1.1) saturate(1.4)',
        'noir':        'contrast(1.3) saturate(0) brightness(1.05)',
        'warm':        'saturate(1.08) sepia(0.08) brightness(1.02)',
        'cool':        'saturate(0.9) hue-rotate(-5deg) brightness(0.98)',
        'hdr-pop':     'contrast(1.3) saturate(1.25) brightness(1.06)',
        'sepia':       'sepia(0.85) saturate(1.2)',
        'pastel':      'saturate(0.75) brightness(1.08) contrast(0.95)',
        'cyberpunk':   'contrast(1.3) saturate(1.5) hue-rotate(10deg)',
        'drama':       'contrast(1.4) saturate(0.8) brightness(0.92)',
        'soft-glow':   'brightness(1.1) contrast(0.95) saturate(1.05) blur(0.5px)',
        'sharp-hd':    'contrast(1.15) saturate(1.1)',
        'retrogame':   'saturate(1.3) contrast(1.2) brightness(1.02)',
        'teal-orange': 'contrast(1.15) saturate(1.2) hue-rotate(-5deg)'
    };

    // Ordered list for chip rendering. 'custom' is omitted - it's implied whenever
    // a live slider moves off zero.
    const PRESET_LABELS = [
        ['none', 'None'],
        ['cinematic', 'Cinematic'], ['vintage', 'Vintage'], ['vivid', 'Vivid'],
        ['noir', 'Noir'], ['warm', 'Warm'], ['cool', 'Cool'], ['hdr-pop', 'HDR Pop'],
        ['sepia', 'Sepia'], ['pastel', 'Pastel'], ['cyberpunk', 'Cyberpunk'],
        ['drama', 'Drama'], ['soft-glow', 'Soft Glow'], ['sharp-hd', 'Sharp HD'],
        ['retrogame', 'Retro'], ['teal-orange', 'Teal/Orange']
    ];

    // The 3 sliders that drive live CSS. Each owns a CSS formatter so the value
    // stays in UI-space (-100..100 etc.) and converts to the float CSS expects
    // only at apply time.
    const LIVE_SLIDERS = [
        { key: 'brightness', label: 'Brightness', min: -50, max: 50, def: 0, icon: 'brightness_6',
          toCss: function(v) { return 'brightness(' + (1 + v * 0.01).toFixed(2) + ')'; } },
        { key: 'contrast',   label: 'Contrast',   min: -50, max: 50, def: 0, icon: 'contrast',
          toCss: function(v) { return 'contrast(' + (1 + v * 0.01).toFixed(2) + ')'; } },
        { key: 'saturation', label: 'Saturation', min: -100, max: 100, def: 0, icon: 'palette',
          toCss: function(v) { return 'saturate(' + (1 + v * 0.01).toFixed(2) + ')'; } }
    ];


    // Real-Time Upscaler Engine
    // v1.7.0 - Modes: 'lanczos' (was 'webgl', honest rebrand: it's Lanczos+Sharpen, NOT AI),
    //                  'anime4k' (NEW: real AI shader for anime via Anime4K.js library, MIT-licensed),
    //                  'server' (Docker AI), 'auto' (smart-pick).
    // 'webgl' is kept as alias for 'lanczos' for backwards-compat with v1.6.x configs.
    const RealtimeUpscaler = {
        _generation: 0,
        _retryCount: 0,
        _nextFrameAt: 0,
        _requestController: null,
        _startupController: null,
        _reason: null,
        _mode: null,       // 'lanczos' | 'anime4k' | 'server' | null
        _active: false,
        _videoElement: null,
        _captureCanvas: null,
        _captureCtx: null,
        _overlayCanvas: null,
        _overlayCtx: null,
        _pendingFrame: false,
        _currentObjectUrl: null,
        _fpsFrameCount: 0,
        _fpsLastTime: 0,
        _currentFps: 0,
        _lowFpsStart: 0,
        _config: null,
        // v1.8.3.24 - read once when the loop starts, not per frame: switching the target
        // endpoint mid-flight would mix masked and unmasked frames on the same overlay.
        _objectMaskEnabled: false,
        _lastDetectionCount: 0,
        _benchmarkResult: null,
        _webglInstance: null,
        _anime4kInstance: null,
        _anime4kCanvas: null,

        start: function(video, config, benchmarkResult) {
            this.stop();
            this._videoElement = video;
            this._config = config;
            this._benchmarkResult = benchmarkResult;
            this._objectMaskEnabled = config.EnableObjectMasking === true;
            this._lastDetectionCount = 0;

            var mode = (config.RealtimeMode || 'auto').toLowerCase();
            // v1.7.0 - 'webgl' rebrand: it was always Lanczos+Sharpen (no AI), so call it that.
            if (mode === 'webgl') mode = 'lanczos';
            this._reason = null;
            if (this._objectMaskEnabled) {
                // Masking replaces upscaling but still uses the shared server capture loop.
                mode = 'server';
                this._reason = 'Object masking replaces plugin upscaling';
            } else if (config.ClientDriverUpscalingActive === true) {
                mode = 'off';
                this._reason = 'Client driver upscaling is active';
            } else if (mode === 'auto') {
                mode = this._decideTier(benchmarkResult, video);
            }
            if (mode === 'off') {
                this._mode = 'off';
                if (window.PlayerIntegration) window.PlayerIntegration.showPlayerNotification(this._reason, 'info');
                return;
            }

            this._mode = mode;
            this._active = true;
            this._activeModel = (benchmarkResult && benchmarkResult.model) || (mode === 'server' ? ((config && config.Model && config.Model !== 'fsrcnn-x2' && config.Model !== 'ncnn-realesrgan-anime-x2') ? config.Model : 'gpu-fast-x2') : (config && config.Model) || null);
            this._lowFpsStart = 0;
            console.log('AI Upscaler RT: Starting in ' + mode + ' mode with model ' + (this._activeModel || 'default'));

            if (mode === 'server') {
                this._startServer();
            } else if (mode === 'anime4k') {
                this._startAnime4K();
            } else if (mode === 'ai-webgpu') {
                this._startWebGPUAI();
            } else {
                // Default: Lanczos+Sharpen WebGL shader (existing fast non-AI path).
                this._startWebGL();
            }

            this._createFpsOverlay();
            this._updateButtonIndicator(mode);
        },

        stop: function() {
            if (this._startupController) this._startupController.abort();
            this._startupController = null;
            this._active = false;
            this._mode = null;
            this._stopServer();
            this._stopWebGL();
            this._stopAnime4K();
            this._stopWebGPUAI();
            this._removeFpsOverlay();
            this._updateButtonIndicator(null);
            console.log('AI Upscaler RT: Stopped');
        },

        _decideTier: function(benchmark, video) {
            if (this._config && this._config.ClientDriverUpscalingActive === true) return 'off';
            if (this._config && this._config.EnableObjectMasking === true) return 'off';
            if (!benchmark || benchmark.error) return 'webgl';
            // Use the playing item's frame rate. Without one, Auto cannot prove
            // the server keeps up; prefer the client shader until it is known.
            var videoFps = Number(benchmark.videoFps);
            if (!Number.isFinite(videoFps) || videoFps <= 0) return 'webgl';
            videoFps *= video.playbackRate || 1;
            if (benchmark.fps >= videoFps * 0.8) return 'server';
            return 'webgl';
        },

        // --- WebGL Tier ---
        _startWebGL: function() {
            if (!window.AIUpscalerWebGL) {
                this._loadWebGLScript(function() {
                    RealtimeUpscaler._initWebGL();
                });
                return;
            }
            this._initWebGL();
        },

        _loadWebGLScript: function(callback) {
            // Check if already loaded
            if (window.AIUpscalerWebGL) { callback(); return; }
            if (document.querySelector('script[data-upscaler-webgl]')) {
                setTimeout(callback, 500);
                return;
            }
            var script = document.createElement('script');
            script.src = pluginScriptUrl('UPSCALERWebGLShader');
            script.setAttribute('data-upscaler-webgl', '1');
            script.onload = function() { setTimeout(callback, 100); };
            script.onerror = function() {
                console.warn('AI Upscaler RT: Could not load WebGL shader from', script.src);
            };
            document.head.appendChild(script);
        },

        _initWebGL: function() {
            if (!window.AIUpscalerWebGL || !this._videoElement || !this._active ||
                (this._mode !== 'lanczos' && this._mode !== 'webgl')) return;
            var wgl = window.AIUpscalerWebGL;
            if (wgl.init(this._videoElement)) {
                wgl.onFpsUpdate = function(fps) {
                    RealtimeUpscaler._currentFps = fps;
                    RealtimeUpscaler._updateFpsDisplay();
                };
                wgl.enable();
                this._webglInstance = wgl;
            }
        },

        _stopWebGL: function() {
            if (this._webglInstance) {
                this._webglInstance.disable();
                this._webglInstance.destroy();
                this._webglInstance = null;
            }
        },

        // --- Anime4K Tier (v1.7.9: embedded, vendored bundle) ---
        // Real Anime4K (4.0.1) WebGL anime upscaling via a VENDORED, tree-shaken
        // Anime4K.js v1.1.2 bundle (MIT, https://github.com/monyone/Anime4K.js)
        // embedded in the plugin DLL and served from UPSCALERAnime4K -- NO CDN, fully
        // self-contained/offline. Exposes window.Anime4KJS. Honest label: anime SHADER,
        // not a neural net. Auto-falls back to Lanczos if WebGL2 float textures are absent.
        _anime4kFpsLoop: function() {
            if (!this._active || this._mode !== 'anime4k' || !this._anime4kInstance) return;
            this._fpsFrameCount++;
            var now = performance.now();
            if (now - this._fpsLastTime >= 1000) {
                this._currentFps = Math.round(this._fpsFrameCount * 1000 / (now - this._fpsLastTime));
                this._fpsFrameCount = 0;
                this._fpsLastTime = now;
                this._updateFpsDisplay();
            }
            if (this._videoElement && 'requestVideoFrameCallback' in this._videoElement) {
                this._videoElement.requestVideoFrameCallback(this._anime4kFpsLoop.bind(this));
            } else {
                requestAnimationFrame(this._anime4kFpsLoop.bind(this));
            }
        },

        _startAnime4K: function() {
            var self = this;
            var generation = this._generation;
            this._loadAnime4KLibrary(function(ok) {
                if (!self._active || self._generation !== generation || self._mode !== 'anime4k') return;
                if (!ok) {
                    console.warn('AI Upscaler RT: Anime4K bundle load failed, falling back to Lanczos');
                    self._fallbackToLanczos();
                    return;
                }
                self._initAnime4K();
                self._fpsFrameCount = 0;
                self._fpsLastTime = performance.now();
                self._anime4kFpsLoop();
            });
        },

        _loadAnime4KLibrary: function(callback) {
            // Load the embedded bundle (exposes window.Anime4KJS). No external network.
            function resolved() { return window.Anime4KJS; }
            if (resolved()) { callback(true); return; }
            if (document.querySelector('script[data-upscaler-anime4k]')) {
                var attempts = 0;
                var poll = setInterval(function() {
                    attempts++;
                    if (resolved()) { clearInterval(poll); callback(true); }
                    else if (attempts >= 50) { clearInterval(poll); callback(false); }
                }, 100);
                return;
            }
            var script = document.createElement('script');
            script.src = pluginScriptUrl('UPSCALERAnime4K');
            script.setAttribute('data-upscaler-anime4k', '1');
            script.onload = function() { setTimeout(function() { callback(!!resolved()); }, 50); };
            script.onerror = function() {
                console.warn('AI Upscaler RT: Failed to load embedded Anime4K bundle', script.src);
                callback(false);
            };
            document.head.appendChild(script);
        },

        _getAnime4KPreset: function() {
            var localPreset = localStorage.getItem('ai_upscaler_anime4k_preset');
            if (localPreset) return localPreset;
            var gpuDesc = '';
            try {
                var testCanvas = document.createElement('canvas');
                var gl = testCanvas.getContext('webgl');
                if (gl) {
                    var ext = gl.getExtension('WEBGL_debug_renderer_info');
                    if (ext) gpuDesc = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
                }
            } catch (e) { /* best effort */ }
            var isIGpu = /intel|uhd|hd graphics|iris|radeon vega/i.test(gpuDesc);

            // Auto-detect older archives / SD video (<= 576p, e.g. 480p DVD/compressed archive)
            var video = this._videoElement || (window.PlayerIntegration && PlayerIntegration.findVideoElement());
            var isSdArchive = video && video.videoHeight > 0 && video.videoHeight <= 576;
            if (isSdArchive) {
                // Older archives have compression artifacts, ringing, and macroblocks.
                // Mode C is specifically designed to denoise & de-artifact older compressed video!
                return isIGpu ? 'mode-c-igpu' : 'mode-c';
            }
            if (isIGpu) {
                return 'simple-m'; // Medium CNN 2x (fast 60fps for Intel UHD 730 on clean HD)
            }
            return (this._config && this._config.Anime4KPreset) || 'mode-a';
        },

        _initAnime4K: function() {
            if (!this._videoElement || !this._active || this._mode !== 'anime4k') return;
            var ns = window.Anime4KJS;
            if (!ns || typeof ns.VideoUpscaler !== 'function') {
                console.warn('AI Upscaler RT: Anime4KJS.VideoUpscaler missing');
                this._fallbackToLanczos();
                return;
            }
            var VideoUpscaler = ns.VideoUpscaler;
            try {
                if (typeof VideoUpscaler.isSupported === 'function' && !VideoUpscaler.isSupported()) {
                    console.warn('AI Upscaler RT: Anime4K unsupported here (no WebGL float textures), using Lanczos');
                    this._fallbackToLanczos();
                    return;
                }
            } catch (e) { this._fallbackToLanczos(); return; }
            // Select high-fidelity Anime4K 4.0.1 model pipeline
            var preset = this._getAnime4KPreset();
            var profile = null;
            var profileLabel = 'HigherEnd Mode A (HQ 7-Pass)';

            var isIGpu = false;
            try {
                var testCanvas = document.createElement('canvas');
                var tgl = testCanvas.getContext('webgl');
                if (tgl) {
                    var ext = tgl.getExtension('WEBGL_debug_renderer_info');
                    if (ext) {
                        var gDesc = tgl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
                        isIGpu = /intel|uhd|hd graphics|iris|radeon vega/i.test(gDesc);
                    }
                }
            } catch (e) {}

            if (preset === 'mode-b' && ns.ANIME4K_HIGHEREND_MODE_B) {
                profile = ns.ANIME4K_HIGHEREND_MODE_B;
                profileLabel = 'HigherEnd Mode B (Soft Lines)';
            } else if ((preset === 'mode-c-igpu' || preset === 'mode-c-fast' || preset === 'simple-denoise-m') && (ns.ANIME4KJS_SIMPLE_DENOISE_M_2X || ns.ANIME4K_LOWEREND_MODE_C)) {
                profile = ns.ANIME4KJS_SIMPLE_DENOISE_M_2X || ns.ANIME4K_LOWEREND_MODE_C;
                profileLabel = 'Mode C Denoise (UHD 730 / Archive)';
            } else if (preset === 'mode-c') {
                if (isIGpu && (ns.ANIME4KJS_SIMPLE_DENOISE_M_2X || ns.ANIME4K_LOWEREND_MODE_C)) {
                    profile = ns.ANIME4KJS_SIMPLE_DENOISE_M_2X || ns.ANIME4K_LOWEREND_MODE_C;
                    profileLabel = 'Mode C Denoise (UHD 730 / Archive)';
                } else if (ns.ANIME4K_HIGHEREND_MODE_C) {
                    profile = ns.ANIME4K_HIGHEREND_MODE_C;
                    profileLabel = 'HigherEnd Mode C (Artifact / Denoise HQ)';
                }
            } else if (preset === 'mode-a-igpu' && ns.ANIME4K_LOWEREND_MODE_A) {
                profile = ns.ANIME4K_LOWEREND_MODE_A;
                profileLabel = 'Mode A Balanced (iGPU 7-Pass)';
            } else if (preset === 'simple-m' && ns.ANIME4KJS_SIMPLE_M_2X) {
                profile = ns.ANIME4KJS_SIMPLE_M_2X;
                profileLabel = 'Medium CNN 2x (Clean Line / UHD 730)';
            } else if (preset === 'simple-l' && ns.ANIME4KJS_SIMPLE_L_2X) {
                profile = ns.ANIME4KJS_SIMPLE_L_2X;
                profileLabel = 'Large CNN 2x (Balanced)';
            } else if (preset === 'simple-ul' && ns.ANIME4KJS_SIMPLE_UL_2X) {
                profile = ns.ANIME4KJS_SIMPLE_UL_2X;
                profileLabel = 'Simple UL 2x (Ultra Large CNN)';
            } else if (preset === 'simple-vl' && ns.ANIME4KJS_SIMPLE_VL_2X) {
                profile = ns.ANIME4KJS_SIMPLE_VL_2X;
                profileLabel = 'Simple VL 2x (Very Large CNN)';
            } else if (preset === 'mode-a' && ns.ANIME4K_HIGHEREND_MODE_A) {
                profile = ns.ANIME4K_HIGHEREND_MODE_A;
                profileLabel = 'HigherEnd Mode A (HQ 7-Pass)';
            } else if (ns.ANIME4KJS_SIMPLE_DENOISE_M_2X) {
                profile = ns.ANIME4KJS_SIMPLE_DENOISE_M_2X;
                profileLabel = 'Mode C Denoise (UHD 730 / Archive)';
            } else if (ns.ANIME4K_HIGHEREND_MODE_A) {
                profile = ns.ANIME4K_HIGHEREND_MODE_A;
                profileLabel = 'HigherEnd Mode A (HQ 7-Pass)';
            } else if (ns.ANIME4KJS_SIMPLE_M_2X) {
                profile = ns.ANIME4KJS_SIMPLE_M_2X;
                profileLabel = 'Medium CNN 2x (UHD 730/Fast)';
            } else {
                profile = ns.ANIME4KJS_SIMPLE_VL_2X || ns.ANIME4KJS_SIMPLE_M_2X || ns.ANIME4KJS_SIMPLE_S_2X;
                profileLabel = 'Simple 2x';
            }

            if (!profile) {
                console.warn('AI Upscaler RT: Anime4K profile missing');
                this._fallbackToLanczos();
                return;
            }
            try {
                this._anime4kCanvas = document.createElement('canvas');
                this._anime4kCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:999;';
                var parent = this._videoElement.parentElement;
                if (parent) { parent.style.position = 'relative'; parent.appendChild(this._anime4kCanvas); }
                this._anime4kProfileName = profileLabel;
                this._anime4kInstance = new VideoUpscaler(profile);
                this._anime4kInstance.onFpsUpdate = function(fps) {
                    RealtimeUpscaler._currentFps = fps;
                    RealtimeUpscaler._updateFpsDisplay();
                };
                this._anime4kInstance.attachVideo(this._videoElement, this._anime4kCanvas);
                this._anime4kInstance.start();
                console.log('AI Upscaler RT: Anime4K (' + profileLabel + ') started');
            } catch (e) {
                console.warn('AI Upscaler RT: Anime4K init threw', e);
                this._fallbackToLanczos();
            }
        },

        _fallbackToLanczos: function() {
            this._stopAnime4K();
            if (!this._active || this._objectMaskEnabled ||
                (this._config && this._config.ClientDriverUpscalingActive)) return;
            this._mode = 'lanczos';
            this._updateButtonIndicator('lanczos');
            this._startWebGL();
        },

        _stopAnime4K: function() {
            if (this._anime4kInstance) {
                try {
                    if (typeof this._anime4kInstance.stop === 'function') this._anime4kInstance.stop();
                    if (typeof this._anime4kInstance.detachVideo === 'function') this._anime4kInstance.detachVideo();
                } catch (e) { /* best effort */ }
                this._anime4kInstance = null;
            }
            if (this._anime4kCanvas && this._anime4kCanvas.parentElement) {
                this._anime4kCanvas.parentElement.removeChild(this._anime4kCanvas);
            }
            this._anime4kCanvas = null;
        },

        // --- WebGPU AI Tier (v1.7.1) ---
        // Real-ESRGAN compact via onnxruntime-web @WebGPU. Loaded lazily via embedded
        // resource (UPSCALERWebGPUAI page) which then loads onnxruntime-web from jsdelivr.
        // Three-stage fallback: WebGPU missing -> ORT load fail -> model fetch fail = Lanczos.
        _startWebGPUAI: function() {
            var self = this;
            var generation = this._generation;
            function current() { return self._active && self._generation === generation && self._mode === 'ai-webgpu'; }
            this._updateFpsDisplay();
            PlayerIntegration.showPlayerNotification('Starting WebGPU AI engine (Real-ESRGAN Compact)...', 'info');
            this._loadWebGPUAIScript(function(loaded) {
                if (!current()) return;
                if (!loaded || !window.WebGPUAIUpscaler) {
                    console.warn('AI Upscaler RT: WebGPU AI script load failed, falling back to WebGL Lanczos3');
                    PlayerIntegration.showPlayerNotification('Failed to load WebGPU AI module. Using WebGL Lanczos3.', 'warning');
                    self._mode = 'lanczos';
                    self._updateButtonIndicator('lanczos');
                    self._startWebGL();
                    return;
                }
                window.WebGPUAIUpscaler.start(self._videoElement, {
                    fpsCallback: function(fps) {
                        RealtimeUpscaler._currentFps = Math.round(fps * 10) / 10;
                        RealtimeUpscaler._updateFpsDisplay();
                    },
                    statusCallback: function(status) {
                        RealtimeUpscaler._updateFpsDisplay();
                    },
                    onFatal: function(reason) {
                        if (!current()) return;
                        console.warn('AI Upscaler RT: WebGPU AI fatal:', reason);
                        PlayerIntegration.showPlayerNotification('WebGPU AI: ' + reason, 'warning');
                        self._reason = reason;
                        RealtimeUpscaler._updateFpsDisplay();
                    }
                }).then(function(ok) {
                    if (!current()) return;
                    if (!ok) {
                        console.warn('AI Upscaler RT: WebGPU AI start returned false');
                        var status = (window.WebGPUAIUpscaler && window.WebGPUAIUpscaler._status) || 'Initialization failed';
                        PlayerIntegration.showPlayerNotification('WebGPU AI: ' + status + '. Browser WebGPU support required.', 'warning');
                        self._reason = status;
                        RealtimeUpscaler._updateFpsDisplay();
                    }
                });
            });
        },

        _loadWebGPUAIScript: function(callback) {
            if (window.WebGPUAIUpscaler) { callback(true); return; }
            if (document.querySelector('script[data-upscaler-webgpu-ai]')) {
                // Already loading - poll briefly.
                var attempts = 0;
                var poll = setInterval(function() {
                    attempts++;
                    if (window.WebGPUAIUpscaler) { clearInterval(poll); callback(true); }
                    else if (attempts >= 50) { clearInterval(poll); callback(false); }
                }, 100);
                return;
            }
            var script = document.createElement('script');
            script.src = pluginScriptUrl('UPSCALERWebGPUAI');
            script.setAttribute('data-upscaler-webgpu-ai', '1');
            script.onload = function() { setTimeout(function() { callback(!!window.WebGPUAIUpscaler); }, 50); };
            script.onerror = function() {
                console.warn('AI Upscaler RT: Failed to load WebGPU AI script from', script.src);
                callback(false);
            };
            document.head.appendChild(script);
        },

        _stopWebGPUAI: function() {
            if (window.WebGPUAIUpscaler && typeof window.WebGPUAIUpscaler.stop === 'function') {
                try { window.WebGPUAIUpscaler.stop(); } catch (e) { /* best effort */ }
            }
        },

        // --- Server AI Tier ---
        _startServer: function() {
            var nativeW = this._videoElement.videoWidth || 1280;
            var nativeH = this._videoElement.videoHeight || 720;
            var configuredW = (this._config && typeof this._config.RealtimeCaptureWidth === 'number') ? this._config.RealtimeCaptureWidth : 0;
            // configuredW <= 0 means Native resolution (upscale actual video resolution, no downscaling)
            var captureW = configuredW > 0 ? configuredW : nativeW;
            var ratio = this._videoElement.videoWidth ? (this._videoElement.videoHeight / this._videoElement.videoWidth) : (nativeH / nativeW);
            var captureH = configuredW > 0 ? Math.round(captureW * ratio) : nativeH;

            // 1440p safety clamp: For 2x upscaling, clamp capture height to 720p max so output is 1440p.
            // This prevents 1080p video from blowing up to 4K (2160p) which chokes bandwidth and drops framerate.
            if (captureH > 720) {
                captureW = Math.round(captureW * (720 / captureH));
                captureH = 720;
            }

            this._captureCanvas = document.createElement('canvas');
            this._captureCanvas.width = captureW;
            this._captureCanvas.height = captureH;
            this._captureCtx = this._captureCanvas.getContext('2d');

            // Overlay canvas for displaying upscaled frames
            this._overlayCanvas = document.createElement('canvas');
            this._overlayCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:999;';
            var parent = this._videoElement.parentElement;
            if (parent) {
                parent.style.position = 'relative';
                parent.appendChild(this._overlayCanvas);
            }

            this._pendingFrame = false;
            this._retryCount = 0;
            this._nextFrameAt = 0;
            this._fpsFrameCount = 0;
            this._fpsLastTime = performance.now();
            this._lastSuccessfulFrame = performance.now();
            // Background tabs may suspend the watchdog throughout a pause. Reset
            // its clock on resume as well, before the first resumed interval runs.
            var self = this;
            this._serverPlaybackListener = function() {
                self._lastSuccessfulFrame = performance.now();
                self._lowFpsStart = 0;
            };
            this._videoElement.addEventListener('pause', this._serverPlaybackListener);
            this._videoElement.addEventListener('playing', this._serverPlaybackListener);
            this._lastFrameShownAt = null;   // no frame drawn yet
            this._currentFps = 0;
            this._lowFpsStart = 0;
            this._serverRenderLoop();
            this._fallbackCheckInterval = setInterval(function() {
                if (!self._active || self._mode !== 'server') return;
                var now = performance.now();
                var video = self._videoElement;
                var playing = !!video && !video.paused;
                // v1.8.3.33 - the overlay covers the whole video, so a frame that is no
                // longer current froze the picture for as long as the service asked the
                // player to wait (a 30 s circuit-breaker Retry-After, say). After 1.5 s
                // without a new frame the layer is hidden until the next one arrives.
                // Object masking keeps its last covered frame: revealing what it covers
                // would defeat it.
                if (self._overlayCanvas && !self._objectMaskEnabled) {
                    var stale = playing && self._lastFrameShownAt !== null && now - self._lastFrameShownAt > 1500;
                    self._overlayCanvas.style.visibility = stale ? 'hidden' : '';
                }
                // Pauses and a service-requested wait are not processing timeouts.
                if (!playing || now < self._nextFrameAt) {
                    self._lastSuccessfulFrame = now;
                    self._lowFpsStart = 0;
                    return;
                }
                if (self._objectMaskEnabled) return;   // masking replaces upscaling; there is nothing to fall back to
                var why = null;
                if (now - self._lastSuccessfulFrame > 10000) {
                    why = 'server unresponsive';
                } else if (self._lastFrameShownAt !== null) {
                    // v1.8.3.33 - frames arrive, but slower than the video needs: a slideshow
                    // over a moving picture. 1.8.3.31 dropped this check; it judges against
                    // the video's own rate now (the 10 fps floor only stands in for it).
                    var videoFps = Number(self._benchmarkResult && self._benchmarkResult.videoFps) || 0;
                    var floor = videoFps ? videoFps * (video.playbackRate || 1) * 0.5 : 10;
                    var fps = now - self._lastFrameShownAt > 2000 ? 0 : self._currentFps;
                    if (fps < floor) {
                        if (!self._lowFpsStart) self._lowFpsStart = now;
                        else if (now - self._lowFpsStart >= 5000) why = 'server too slow: ' + fps + ' fps';
                    } else {
                        self._lowFpsStart = 0;
                    }
                }
                if (why) {
                    // We used to automatically fallback to Lanczos here if the server dropped below half framerate.
                    // However, users complained this forced them off their selected engine unexpectedly when testing heavy models or 720p streams.
                    // We now just show a warning notification but KEEP them on the Server AI engine.
                    if (window.PlayerIntegration && !self._fallbackNotified) {
                        window.PlayerIntegration.showPlayerNotification('Server AI running at ' + fps + ' fps', 'info');
                        self._fallbackNotified = true;
                    }
                } else {
                    self._fallbackNotified = false;
                }
            }, 1000);
        },

        _stopServer: function() {
            this._generation++;
            if (this._videoElement && this._serverPlaybackListener) {
                this._videoElement.removeEventListener('pause', this._serverPlaybackListener);
                this._videoElement.removeEventListener('playing', this._serverPlaybackListener);
            }
            this._serverPlaybackListener = null;
            if (this._requestController) this._requestController.abort();
            this._requestController = null;
            this._pendingFrame = false;
            this._nextFrameAt = 0;
            if (this._serverRafId != null) cancelAnimationFrame(this._serverRafId);
            this._serverRafId = null;
            if (this._fallbackCheckInterval) clearInterval(this._fallbackCheckInterval);
            this._fallbackCheckInterval = null;
            if (this._currentObjectUrl) URL.revokeObjectURL(this._currentObjectUrl);
            this._currentObjectUrl = null;
            if (this._overlayCanvas && this._overlayCanvas.parentElement) {
                this._overlayCanvas.parentElement.removeChild(this._overlayCanvas);
            }
            this._overlayCanvas = null;
            this._overlayCtx = null;
            this._captureCanvas = null;
            this._captureCtx = null;
        },

        _serverRafId: null,

        _lastCaptureTime: 0,
        _serverRenderLoop: function() {
            if (!this._active || this._mode !== 'server') return;
            var now = performance.now();
            var targetFps = Math.max(15, Math.min(60, (this._config && this._config.RealtimeTargetFps) || 60));
            var minInterval = (1000 / targetFps) * 0.85;
            if (this._videoElement && !this._videoElement.paused &&
                now >= this._nextFrameAt && (now - this._lastCaptureTime >= minInterval)) {
                this._lastCaptureTime = now;
                this._captureAndSend();
            }
            this._serverRafId = requestAnimationFrame(function() { RealtimeUpscaler._serverRenderLoop(); });
        },

        _retryAfterMs: function(value) {
            if (!value) return 0;
            var ms = 0;
            if (/^\d+(\.\d+)?$/.test(value.trim())) ms = Number(value) * 1000;
            else {
                var date = Date.parse(value);
                ms = Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
            }
            // Real-time video must never pause for full batch Retry-After (e.g. 30s)
            return Math.min(250, ms);
        },

        _waitForFrame: function(retryAfter, detail) {
            var delay = Math.min(100, 20 * Math.pow(1.5, Math.min(this._retryCount++, 3)));
            this._nextFrameAt = performance.now() + Math.max(delay, this._retryAfterMs(retryAfter));
            this._reason = detail;
        },

        _captureAndSend: function() {
            var self = this;
            var video = this._videoElement;
            var canvas = this._captureCanvas;
            this._pendingFrames = this._pendingFrames || 0;
            this._frameCount = this._frameCount || 0;
            this._requestControllers = this._requestControllers || new Set();
            var maxConcurrent = 8;
            if (this._pendingFrames >= maxConcurrent || !this._active || this._mode !== 'server' || !video || video.paused ||
                !this._captureCtx || !canvas || performance.now() < this._nextFrameAt) return;
            var generation = this._generation;
            var controller = new AbortController();
            this._requestControllers.add(controller);
            this._pendingFrames++;
            this._frameCount++;
            var frameIndex = this._frameCount;
            var finished = false;
            function current() { return self._active && self._mode === 'server' && self._generation === generation; }
            function finish() {
                if (finished) return;
                finished = true;
                self._pendingFrames = Math.max(0, self._pendingFrames - 1);
                self._requestControllers.delete(controller);
            }
            function failed(error) {
                if (current() && error.name !== 'AbortError') self._waitForFrame(null, error.message || 'Frame request failed');
                finish();
            }
            try {
                this._captureCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(function(blob) {
                    if (!current()) { finish(); return; }
                    if (!blob) { failed(new Error('Could not capture video frame')); return; }
                    var endpoint = self._objectMaskEnabled ? 'Upscaler/detect-mask' : 'Upscaler/upscale-frame';
                    fetch(ApiClient.getUrl(endpoint), {
                        method: 'POST',
                        headers: { 'Authorization': 'MediaBrowser Token="' + ApiClient.accessToken() + '"' },
                        body: blob,
                        signal: controller.signal
                    }).then(async function(resp) {
                        if (!current()) return null;
                        if (!resp.ok) {
                            var detail = await resp.text();
                            try { var data = JSON.parse(detail); detail = data.detail || data.error || detail; } catch (e) { /* plain text */ }
                            if (current()) self._waitForFrame(resp.headers.get('Retry-After'), 'HTTP ' + resp.status + ': ' + String(detail).slice(0, 500));
                            return null;
                        }
                        if (self._objectMaskEnabled) self._lastDetectionCount = parseInt(resp.headers.get('X-Detections'), 10) || 0;
                        return resp.blob();
                    }).then(function(resultBlob) {
                        finish();
                        if (!current()) return;
                        if (!resultBlob) return;
                        self._lastDrawnFrame = self._lastDrawnFrame || 0;
                        if (frameIndex < self._lastDrawnFrame - 2) return;
                        if (frameIndex > self._lastDrawnFrame) self._lastDrawnFrame = frameIndex;

                        function drawToCanvas(source) {
                            if (!current()) return;
                            try {
                                var sw = source.width, sh = source.height;
                                if (self._overlayCanvas.width !== sw) self._overlayCanvas.width = sw;
                                if (self._overlayCanvas.height !== sh) self._overlayCanvas.height = sh;
                                if (!self._overlayCtx) self._overlayCtx = self._overlayCanvas.getContext('2d');
                                self._overlayCtx.drawImage(source, 0, 0);
                                self._overlayCanvas.style.visibility = '';
                                self._lastSuccessfulFrame = performance.now();
                                self._lastFrameShownAt = self._lastSuccessfulFrame;
                                self._retryCount = 0;
                                self._reason = null;
                                self._fpsFrameCount++;
                                var now = performance.now();
                                if (now - self._fpsLastTime >= 1000) {
                                    self._currentFps = Math.round(self._fpsFrameCount * 1000 / (now - self._fpsLastTime));
                                    self._fpsFrameCount = 0;
                                    self._fpsLastTime = now;
                                    self._updateFpsDisplay();
                                }
                            } catch (error) { failed(error); }
                        }

                        if (window.createImageBitmap) {
                            createImageBitmap(resultBlob).then(function(bitmap) {
                                drawToCanvas(bitmap);
                                if (bitmap.close) bitmap.close();
                            }).catch(function() {
                                renderWithImage();
                            });
                        } else {
                            renderWithImage();
                        }

                        function renderWithImage() {
                            var img = new Image();
                            var url = URL.createObjectURL(resultBlob);
                            function release() {
                                URL.revokeObjectURL(url);
                            }
                            img.onload = function() {
                                release();
                                drawToCanvas(img);
                            };
                            img.onerror = function() {
                                release();
                                failed(new Error('Could not decode processed frame'));
                            };
                            img.src = url;
                        }
                    }).catch(failed);
                }, 'image/jpeg', 0.72);
            } catch (error) { failed(error); }
        },

        // --- UI ---
        _createFpsOverlay: function() {
            this._removeFpsOverlay();
            var el = document.createElement('div');
            el.id = 'aiUpscalerFpsOverlay';
            el.style.cssText = 'position:absolute;top:14px;left:14px;z-index:2147483647;padding:5px 12px;' +
                'background:rgba(0,0,0,0.8);color:#34d399;font-size:13px;font-family:monospace;font-weight:bold;' +
                'border-radius:6px;pointer-events:none;backdrop-filter:blur(6px);' +
                'opacity:1;transition:opacity .25s ease;box-shadow:0 2px 8px rgba(0,0,0,0.5);';
            el.textContent = 'AI --fps';
            var parent = document.querySelector('.videoPlayerContainer') ||
                         document.querySelector('#videoOsdPage:not(.hide)') ||
                         document.body;
            parent.appendChild(el);

            // Auto-hide with Jellyfin's OSD: full opacity when controls active, subtle 0.4 dimming when idle
            var self = this;
            this._fpsVisSync = setInterval(function() {
                if (!el.isConnected) {
                    var container = document.querySelector('.videoPlayerContainer') || document.body;
                    if (container && !container.contains(el)) container.appendChild(el);
                    return;
                }
                var activePage = document.querySelector('#videoOsdPage:not(.hide)') ||
                                 document.querySelector('.page:not(.hide)');
                var osd = (activePage && activePage.querySelector('.videoOsdBottom, .osdControls')) ||
                          document.querySelector('.videoPlayerContainer .videoOsdBottom') ||
                          document.querySelector('.videoOsdBottom');
                var visible = osd && osd.offsetParent !== null &&
                              parseFloat(getComputedStyle(osd).opacity || '0') > 0.05;
                el.style.opacity = visible ? '1' : '0.45';
            }, 300);
        },

        _removeFpsOverlay: function() {
            if (this._fpsVisSync) { clearInterval(this._fpsVisSync); this._fpsVisSync = null; }
            var el = document.getElementById('aiUpscalerFpsOverlay');
            if (el) el.remove();
        },

        _updateFpsDisplay: function() {
            var el = document.getElementById('aiUpscalerFpsOverlay');
            if (!el) return;
            var mode = this._mode;
            var modeLabel = '';
            var modelLabel = '';
            var isNeural = true;

            if (mode === 'server') {
                modeLabel = 'Server AI';
                var sModel = this._activeModel || (this._benchmarkResult && this._benchmarkResult.model) || (this._config && this._config.Model) || 'gpu-fast-x2';
                modelLabel = ' (' + sModel + ')';
            } else if (mode === 'anime4k') {
                modeLabel = 'Anime4K';
                modelLabel = ' (GLSL Tensor)';
            } else if (mode === 'ai-webgpu') {
                modeLabel = 'WebGPU AI';
                if (window.WebGPUAIUpscaler && window.WebGPUAIUpscaler._status && window.WebGPUAIUpscaler._status !== 'running') {
                    modelLabel = ' [' + window.WebGPUAIUpscaler._status + ']';
                } else if (window.WebGPUAIUpscaler && window.WebGPUAIUpscaler._session) {
                    modelLabel = ' (Real-ESRGAN Compact)';
                } else {
                    modelLabel = ' [Loading Model...]';
                }
            } else if (mode === 'lanczos' || mode === 'webgl') {
                isNeural = false;
                modeLabel = 'WebGL (Lanczos3 + Edge Tensor)';
            } else {
                modeLabel = String(mode);
            }

            var resLabel = '';
            var inW = 0, inH = 0, outW = 0, outH = 0;
            if (mode === 'server') {
                if (this._captureCanvas && this._captureCanvas.width && this._overlayCanvas && this._overlayCanvas.width) {
                    inW = this._captureCanvas.width;
                    inH = this._captureCanvas.height;
                    outW = this._overlayCanvas.width;
                    outH = this._overlayCanvas.height;
                }
            } else if (mode === 'anime4k') {
                if (this._videoElement && this._videoElement.videoWidth && this._anime4kCanvas && this._anime4kCanvas.width) {
                    inW = this._videoElement.videoWidth;
                    inH = this._videoElement.videoHeight;
                    outW = this._anime4kCanvas.width;
                    outH = this._anime4kCanvas.height;
                }
            } else if (mode === 'ai-webgpu') {
                var wgpuCanvas = window.WebGPUAIUpscaler && window.WebGPUAIUpscaler._canvas;
                if (this._videoElement && this._videoElement.videoWidth && wgpuCanvas && wgpuCanvas.width) {
                    inW = this._videoElement.videoWidth;
                    inH = this._videoElement.videoHeight;
                    outW = wgpuCanvas.width;
                    outH = wgpuCanvas.height;
                }
            } else if (this._webglInstance && this._webglInstance.canvas && this._videoElement) {
                inW = this._videoElement.videoWidth;
                inH = this._videoElement.videoHeight;
                outW = this._webglInstance.canvas.width;
                outH = this._webglInstance.canvas.height;
            }
            if (inW && inH && outW && outH) {
                resLabel = ' | ' + inW + 'x' + inH + ' -> ' + outW + 'x' + outH;
            }

            var fpsDisplay = this._currentFps > 0 ? this._currentFps + 'fps' : '--fps';
            var header = isNeural ? ('AI ' + fpsDisplay) : ('WebGL ' + fpsDisplay);
            el.textContent = header + ' | ' + modeLabel + modelLabel + resLabel;
            el.style.color = this._currentFps >= 20 ? '#34d399' : this._currentFps >= 10 ? '#fbbf24' : '#ef4444';
        },

        _updateButtonIndicator: function(mode) {
            var btn = document.getElementById('aiUpscalerButton');
            if (!btn) return;
            // Remove old indicator
            var old = btn.querySelector('.ai-rt-dot');
            if (old) old.remove();

            if (!mode) return;
            var dot = document.createElement('span');
            dot.className = 'ai-rt-dot';
            dot.style.cssText = 'position:absolute;top:2px;right:2px;width:8px;height:8px;border-radius:50%;';
            dot.style.background = mode === 'server' ? '#34d399' : '#60a5fa';
            btn.style.position = 'relative';
            btn.appendChild(dot);
        },

        getStatus: function() {
            return {
                active: this._active,
                mode: this._mode,
                fps: this._currentFps,
                activeModel: this._activeModel,
                benchmark: this._benchmarkResult,
                reason: this._reason
            };
        }
    };

    window.RealtimeUpscaler = RealtimeUpscaler;

    // Player integration manager
    const PlayerIntegration = {
        _buttonInjected: false,
        _stylesInjected: false,
        _playbackListenersAttached: false,
        _menuCloseHandler: null,
        _menuAutoCloseTimer: null,
        _cachedConfig: null,
        _configCacheTime: 0,
        _modelStates: null,

        // Initialize - called once when script loads
        init: function() {
            console.log('AI Upscaler: Player Integration v' + PLUGIN_VERSION + ' initializing...');
            this.addStyles();

            document.addEventListener('viewshow', function(e) {
                PlayerIntegration.onViewShow(e);
            });

            // Listen to SPA routing events
            window.addEventListener('hashchange', function() {
                PlayerIntegration.onViewShow();
            });
            window.addEventListener('popstate', function() {
                PlayerIntegration.onViewShow();
            });

            // Pointer/mouse movement and touch ensure button is restored as soon as OSD is awakened
            ['pointermove', 'mousemove', 'touchstart'].forEach(function(evt) {
                document.addEventListener(evt, function() {
                    if (PlayerIntegration.isVideoPage() || document.querySelector('video')) {
                        var target = PlayerIntegration._findTargetContainer();
                        var btn = document.getElementById('aiUpscalerButton');
                        if (!btn || !target || btn.parentElement !== target.container) {
                            PlayerIntegration.injectPlayerButton();
                        }
                    }
                }, { passive: true });
            });

            // If player is ALREADY active on script load (e.g. reload or direct link)
            if (this.isVideoPage()) {
                this.onViewShow();
            }

            this.waitForApiClient();
            this.addKeyboardShortcuts();
            console.log('AI Upscaler: Player Integration v' + PLUGIN_VERSION + ' loaded');
        },

        isVideoPage: function() {
            var h = window.location.hash || '';
            return h.indexOf('/video') !== -1 ||
                   h.indexOf('/playback') !== -1 ||
                   document.getElementById('videoOsdPage') !== null ||
                   document.querySelector('.videoOsdBottom, .btnVideoOsdSettings') !== null;
        },

        waitForApiClient: function() {
            var retries = 0;
            var maxRetries = 30;
            var check = function() {
                if (window.ApiClient) {
                    PlayerIntegration.attachPlaybackListeners();
                } else if (retries < maxRetries) {
                    retries++;
                    setTimeout(check, 1000);
                }
            };
            check();
        },

        onViewShow: function(e) {
            var detail = (e && e.detail) || {};
            var type = detail.type || '';
            var isVideo = type === 'video-osd' ||
                          (e && e.target && e.target.id === 'videoOsdPage') ||
                          PlayerIntegration.isVideoPage();

            if (isVideo) {
                this._buttonInjected = false;
                this.injectPlayerButton();
                // Modern Jellyfin (10.11+) no longer exposes window.playbackManager,
                // so playbackstart listener never fires. Wait for video element + playing event instead.
                this._waitForVideoAndAutoStart();
                this._startWatchdog();
            } else {
                // Leaving video page - stop upscaling
                if (window.RealtimeUpscaler) {
                    window.RealtimeUpscaler.stop();
                }
                this._stopWatchdog();
            }
        },

        _watchdogTimer: null,
        _startWatchdog: function() {
            if (this._watchdogTimer) return;
            var self = this;
            this._watchdogTimer = setInterval(function() {
                if (self.isVideoPage() || document.querySelector('video')) {
                    var target = self._findTargetContainer();
                    var btn = document.getElementById('aiUpscalerButton');
                    if (!btn || !target || btn.parentElement !== target.container) {
                        self.injectPlayerButton();
                    }
                } else {
                    self._stopWatchdog();
                }
            }, 1000);
        },

        _stopWatchdog: function() {
            if (this._watchdogTimer) {
                clearInterval(this._watchdogTimer);
                this._watchdogTimer = null;
            }
        },

        _waitForVideoAndAutoStart: function() {
            if (this._autoStartPending) return;
            this._autoStartPending = true;
            var self = this;
            var generation = RealtimeUpscaler._generation;
            var retries = 0;
            var maxRetries = 60; // 30s @ 500ms
            var check = function() {
                if (generation !== RealtimeUpscaler._generation) {
                    self._autoStartPending = false;
                    return;
                }
                var v = self.findVideoElement();
                if (v) {
                    self._autoStartPending = false;
                    var trigger = function() {
                        if (generation !== RealtimeUpscaler._generation) return;
                        if (!PlayerIntegration.isVideoPage()) return;
                        setTimeout(function() {
                            if (generation !== RealtimeUpscaler._generation ||
                                !PlayerIntegration.isVideoPage()) return;
                            self.startRealtimeUpscaling();
                        }, 600);
                    };
                    if (v.readyState >= 2 && !v.paused) {
                        trigger();
                    } else {
                        v.addEventListener('playing', trigger, { once: true });
                    }
                    return;
                }
                if (++retries < maxRetries) {
                    setTimeout(check, 500);
                } else {
                    self._autoStartPending = false;
                }
            };
            check();
        },

        _findTargetContainer: function() {
            function isValidTarget(el) {
                if (!el || !document.body.contains(el)) return false;
                // Exclude elements trapped in background/inactive SPA views
                if (el.closest && el.closest('.page.hide')) return false;
                var hiddenAncestor = el.closest ? el.closest('[aria-hidden="true"]') : null;
                if (hiddenAncestor && !hiddenAncestor.closest('#videoOsdPage, .videoOsdBottom, .videoPlayerContainer, .osdControls, .skinHeader')) {
                    return false;
                }
                return true;
            }

            // Priority 1: Find neighboring OSD control buttons (.btnVideoOsdSettings, .btnToggleFullscreen, etc.)
            var refButtons = document.querySelectorAll('.btnVideoOsdSettings, [data-action="settings"], .btnToggleFullscreen, .btnFullscreen, [data-action="fullscreen"], .btnPip, .btnUserRating');
            var fallbackRef = null;
            for (var b = 0; b < refButtons.length; b++) {
                var btn = refButtons[b];
                if (isValidTarget(btn) && btn.parentElement) {
                    if (btn.offsetParent !== null || (btn.closest && btn.closest('#videoOsdPage, .videoPlayerContainer, .videoOsdBottom'))) {
                        return { container: btn.parentElement, refButton: btn };
                    }
                    if (!fallbackRef) fallbackRef = { container: btn.parentElement, refButton: btn };
                }
            }
            if (fallbackRef) return fallbackRef;

            // Priority 2: Standard Jellyfin toolbar containers
            var selectors = [
                '.videoOsdBottom .buttons',
                '#videoOsdPage .buttons',
                '.osdControls .buttons',
                '.buttons.focuscontainer-x',
                '.videoOsdBottom .osdControls',
                '.osdBottomBar',
                '.videoOsdBottom'
            ];
            for (var i = 0; i < selectors.length; i++) {
                var els = document.querySelectorAll(selectors[i]);
                for (var j = 0; j < els.length; j++) {
                    var el = els[j];
                    if (isValidTarget(el)) {
                        var childRef = el.querySelector('.btnVideoOsdSettings, .btnToggleFullscreen, .btnFullscreen, .btnPip, button:last-child');
                        return { container: el, refButton: childRef };
                    }
                }
            }
            return null;
        },

        _injectRetryCount: 0,
        _mutationObserver: null,

        injectPlayerButton: function() {
            var target = this._findTargetContainer();
            if (!target || !target.container) {
                this._injectRetryCount++;
                var self = this;
                var delay = Math.min(300 * Math.pow(1.3, Math.min(this._injectRetryCount, 6)), 2000);
                setTimeout(function() {
                    if (self.isVideoPage() || document.querySelector('video')) {
                        self.injectPlayerButton();
                    }
                }, delay);
                this._startMutationObserver();
                return;
            }

            this._injectRetryCount = 0;
            this._startMutationObserver();

            var btn = document.getElementById('aiUpscalerButton');
            if (btn) {
                // If the button exists and is already properly placed in target container, nothing to do
                if (btn.parentElement === target.container && document.body.contains(btn)) {
                    this._buttonInjected = true;
                    if (window.RealtimeUpscaler && RealtimeUpscaler._updateButtonIndicator) {
                        RealtimeUpscaler._updateButtonIndicator(RealtimeUpscaler._mode);
                    }
                    return;
                }
                // Otherwise move it into the correct active container
                if (target.refButton && target.refButton.parentElement === target.container) {
                    target.container.insertBefore(btn, target.refButton);
                } else {
                    target.container.appendChild(btn);
                }
                this._buttonInjected = true;
                if (window.RealtimeUpscaler && RealtimeUpscaler._updateButtonIndicator) {
                    RealtimeUpscaler._updateButtonIndicator(RealtimeUpscaler._mode);
                }
                return;
            }

            // Create button element
            btn = document.createElement('button');
            btn.id = 'aiUpscalerButton';
            btn.className = 'paper-icon-button-light autoSize';
            btn.setAttribute('is', 'paper-icon-button-light');
            btn.setAttribute('type', 'button');
            btn.setAttribute('title', 'AI Upscaler (Alt+M)');
            btn.setAttribute('aria-label', 'AI Upscaler (Alt+M)');
            btn.style.cssText = 'position:relative;display:inline-flex;align-items:center;justify-content:center;';
            btn.innerHTML = '<span class="material-icons" style="font-size:24px;line-height:1;display:inline-block;">auto_awesome</span>';

            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                PlayerIntegration.toggleUpscalerMenu();
            });

            if (target.refButton && target.refButton.parentElement === target.container) {
                target.container.insertBefore(btn, target.refButton);
            } else {
                target.container.appendChild(btn);
            }

            this._buttonInjected = true;
            if (window.RealtimeUpscaler && RealtimeUpscaler._updateButtonIndicator) {
                RealtimeUpscaler._updateButtonIndicator(RealtimeUpscaler._mode);
            }
            console.log('AI Upscaler: Player button injected');
        },

        attachPlaybackListeners: function() {
            if (this._playbackListenersAttached) return;

            if (window.playbackManager) {
                try {
                    window.playbackManager.addEventListener('playbackstart', function() {
                        PlayerIntegration._buttonInjected = false;
                        setTimeout(function() { PlayerIntegration.injectPlayerButton(); }, 500);
                        // Start real-time upscaling after 1s settle time
                        setTimeout(function() { PlayerIntegration.startRealtimeUpscaling(); }, 1000);
                    });
                    window.playbackManager.addEventListener('playbackstop', function() {
                        PlayerIntegration._buttonInjected = false;
                        RealtimeUpscaler.stop();
                    });
                    this._playbackListenersAttached = true;
                } catch (err) {
                    console.warn('AI Upscaler: Could not attach playback listeners:', err);
                }
            }

            // Periodic button integrity check (restores button if detached during SPA view transitions)
            if (!this._buttonCheckInterval) {
                this._buttonCheckInterval = setInterval(function() {
                    if (PlayerIntegration.isVideoPage() || document.querySelector('video')) {
                        var btn = document.getElementById('aiUpscalerButton');
                        if (!btn || !btn.isConnected) {
                            PlayerIntegration.injectPlayerButton();
                        }
                    }
                }, 2000);
            }
        },

        // Get config with 10s cache
        getPluginConfig: function() {
            var now = Date.now();
            if (this._cachedConfig && (now - this._configCacheTime) < 10000) {
                return Promise.resolve(this._cachedConfig);
            }
            if (window.ApiClient) {
                return window.ApiClient.getPluginConfiguration(PLUGIN_ID).then(function(config) {
                    PlayerIntegration._cachedConfig = config;
                    PlayerIntegration._configCacheTime = Date.now();
                    return config;
                });
            }
            return Promise.resolve({});
        },

        updatePluginConfig: function(updates) {
            if (!window.ApiClient) return Promise.reject(new Error('ApiClient unavailable'));
            return this.getPluginConfig().then(function(config) {
                var newConfig = Object.assign({}, config, updates);
                PlayerIntegration._cachedConfig = newConfig;
                PlayerIntegration._configCacheTime = Date.now();
                return window.ApiClient.updatePluginConfiguration(PLUGIN_ID, newConfig);
            });
        },

        // Menu management
        _cleanupMenu: function() {
            if (this._menuCloseHandler) {
                document.removeEventListener('click', this._menuCloseHandler);
                this._menuCloseHandler = null;
            }
            if (this._menuAutoCloseTimer) {
                clearTimeout(this._menuAutoCloseTimer);
                this._menuAutoCloseTimer = null;
            }
            if (this._statusPollTimer) {
                clearInterval(this._statusPollTimer);
                this._statusPollTimer = null;
            }
        },

        // Refresh the live status row - state/mode/fps/model. Runs every 500ms while menu is open.
        // Reads truth from RealtimeUpscaler (active flag, mode, _currentFps, _benchmarkResult.model)
        // and falls back to the configured model when idle. No placeholders - the RT engine tracks
        // FPS in requestAnimationFrame (WebGL) or from the server capture loop.
        _refreshStatusRow: function() {
            var menu = document.querySelector('#aiUpscalerQuickMenu');
            if (!menu) return;
            var dot = menu.querySelector('[data-status-dot]');
            var stateEl = menu.querySelector('[data-status-state]');
            var modeEl = menu.querySelector('[data-status-mode]');
            var fpsEl = menu.querySelector('[data-status-fps]');
            var modelEl = menu.querySelector('[data-status-model]');
            if (!dot || !stateEl || !modeEl || !fpsEl || !modelEl) return;

            var rt = window.RealtimeUpscaler;
            var st = rt && typeof rt.getStatus === 'function' ? rt.getStatus() : null;
            var cfg = this._cachedConfig || {};
            var video = document.querySelector('video');
            var playing = video && !video.paused && !video.ended && video.readyState >= 2;
            var fps = null, target = 0, level = '';

            if (st && st.active) {
                dot.className = 'ai-menu__status-dot ai-menu__status-dot--on';
                stateEl.textContent = 'ACTIVE';
                modeEl.textContent = this._modeLabel(st.mode);
                fps = st.fps | 0;
                // Judge the rate against the video's own frame rate when the benchmark
                // knows it (server mode); the fixed 20/10 fps marks only stand in for it.
                target = Number(st.benchmark && st.benchmark.videoFps) || 0;
                level = target ? (fps >= target * 0.8 ? '' : fps >= target * 0.5 ? 'warn' : 'err')
                               : (fps >= 20 ? '' : fps >= 10 ? 'warn' : 'err');
                modelEl.textContent = (st && st.activeModel) || (st.benchmark && st.benchmark.model) || (st.mode === 'server' ? 'gpu-fast-x2' : (cfg.Model || '-'));
            } else if (playing && cfg.EnablePlugin === false) {
                dot.className = 'ai-menu__status-dot ai-menu__status-dot--off';
                stateEl.textContent = 'DISABLED';
                modeEl.textContent = '-';
                modelEl.textContent = cfg.Model || '-';
            } else if (playing) {
                dot.className = 'ai-menu__status-dot ai-menu__status-dot--warn';
                stateEl.textContent = 'STANDBY';
                modeEl.textContent = st && st.mode === 'off' ? 'Off' : '-';
                // A guard that switched realtime off says why; show that instead of a model.
                modelEl.textContent = (st && st.reason) || cfg.Model || '-';
            } else {
                dot.className = 'ai-menu__status-dot ai-menu__status-dot--off';
                stateEl.textContent = 'IDLE';
                modeEl.textContent = '-';
                modelEl.textContent = cfg.Model || '-';
            }
            fpsEl.innerHTML = '<b>' + (fps === null ? '-' : fps) + '</b> fps';
            fpsEl.className = 'ai-menu__status-fps' + (level ? ' ai-menu__status-fps--' + level : '');
            this._drawFpsTrend(menu, fps, target, level);

            // Live-update Realtime tab
            var rtStatusEl = document.getElementById('aiRtStatusValue');
            if (st && rtStatusEl) {
                var rtIndicator = document.getElementById('aiRtIndicator');
                var toggleBtn = menu.querySelector('[data-rt-toggle]');
                var switchBtn = menu.querySelector('[data-rt-switch]');
                rtStatusEl.textContent = st.active ? this._modeLabel(st.mode) + ' - ' + st.fps + ' fps' : (st.reason || 'Stopped');
                rtStatusEl.classList.toggle('ai-menu__rt-value--on', !!st.active);
                if (rtIndicator) rtIndicator.classList.toggle('ai-menu__rt-indicator--on', !!st.active);
                if (toggleBtn) toggleBtn.textContent = st.active ? 'Stop' : 'Start';
                if (switchBtn) {
                    switchBtn.disabled = !st.active;
                    switchBtn.textContent = !st.active ? 'Switch engine' : st.mode === 'server' ? 'Switch to Lanczos' : 'Switch to Server AI';
                }
                var engineKey = st.mode === 'webgl' ? 'lanczos' : st.mode;
                var rows = menu.querySelectorAll('[data-engine]');
                for (var r = 0; r < rows.length; r++) {
                    rows[r].classList.toggle('ai-menu__engine--on', !!st.active && rows[r].getAttribute('data-engine') === engineKey);
                }
            }

            // Live-update Diag tab
            var diagEl = document.getElementById('aiDiagLogs');
            if (diagEl) {
                var diagTab = menu.querySelector('[data-pane="diag"]');
                if (diagTab && diagTab.classList.contains('ai-menu__pane--active')) {
                    var out = "=== CLIENT METRICS ===\n";
                    out += "Engine State: " + (st.active ? "ACTIVE" : "STOPPED") + "\n";
                    out += "Active Mode : " + (st.mode || 'None') + "\n";
                    out += "Client FPS  : " + (st.fps | 0) + " / " + target + " fps\n";
                    if (st.benchmark) {
                        out += "Server Latency: " + Math.round(st.benchmark.pingMs || 0) + " ms\n";
                        out += "Video Frame : " + (video ? video.videoWidth + "x" + video.videoHeight : "?") + "\n";
                        out += "Target Scale: " + (st.benchmark.serverScale || cfg.ScaleFactor || 2) + "x\n";
                    }
                    if (video && typeof video.getVideoPlaybackQuality === 'function') {
                        var q = video.getVideoPlaybackQuality();
                        out += "Dropped Frames: " + q.droppedVideoFrames + " / " + q.totalVideoFrames;
                        if (q.totalVideoFrames > 0) {
                            out += " (" + (q.droppedVideoFrames / q.totalVideoFrames * 100).toFixed(1) + "%)";
                        }
                        out += "\n";
                    }
                    if (st.reason) out += "Notice: " + st.reason + "\n";
                    if (st.mode === 'anime4k') {
                        out += "Anime4K Pipeline: " + (RealtimeUpscaler._anime4kProfileName || "HigherEnd Mode A (HQ 7-Pass)") + "\n";
                    }
                    
                    if (st.mode === 'server') {
                        out += "\n=== SERVER STATUS ===\n";
                        fetch(ApiClient.getUrl('Upscaler/service-health'), { headers: { 'Authorization': 'MediaBrowser Token="' + ApiClient.accessToken() + '"' } }).then(function(res) { return res.json(); }).then(function(sData) {
                            out += "GPU Active  : " + (sData.usingGpu ? "YES" : "NO") + "\n";
                            out += "Hardware    : " + (sData.usingGpu ? "GPU" : "CPU") + "\n";
                            out += "GPU Load    : " + (sData.gpuLoad != null ? sData.gpuLoad.toFixed(1) + "%" : "N/A") + "\n";
                            out += "GPU VRAM    : " + (sData.gpuVram != null ? (sData.gpuVram / 1024 / 1024).toFixed(0) + " MB" : "N/A") + "\n";
                            out += "Model Loaded: " + (sData.currentModel || "None") + "\n";
                            out += "Provider    : " + (sData.providers && sData.providers[0] ? sData.providers[0] : "?") + "\n";
                            if (!sData.available) out += "WARNING: Backend AI offline or timeout!\n";
                            diagEl.textContent = out;
                        }).catch(function(e) {
                            diagEl.textContent = out + "Could not fetch backend status.\n";
                        });
                    } else {
                        diagEl.textContent = out;
                    }
                }
            }
        },

        _modeLabel: function(mode) {
            var labels = { server: 'Server AI', lanczos: 'WebGL (Lanczos3)', webgl: 'WebGL (Lanczos3)', anime4k: 'Anime4K', 'ai-webgpu': 'WebGPU AI', off: 'Off' };
            return labels[mode] || (mode ? String(mode) : '-');
        },

        // Last 20 s of the frame rate (one sample per 500 ms poll), drawn against a
        // dashed line at the video's own rate - "is it keeping up?" at a glance.
        _drawFpsTrend: function(menu, fps, target, level) {
            var hist = this._fpsHistory || (this._fpsHistory = []);
            if (fps === null) hist.length = 0;
            else { hist.push(fps); if (hist.length > 40) hist.shift(); }
            var svg = menu.querySelector('[data-status-spark]');
            if (!svg) return;
            var line = svg.querySelector('.ai-menu__spark-line');
            var goal = svg.querySelector('.ai-menu__spark-target');
            var W = 120, H = 36, top = Math.max(target * 1.25, 10);
            for (var i = 0; i < hist.length; i++) top = Math.max(top, hist[i] * 1.1);
            var pts = [];
            for (var j = 0; j < hist.length; j++) {
                var x = W * (40 - hist.length + j) / 39;
                pts.push(x.toFixed(1) + ',' + (H - 2 - hist[j] / top * (H - 4)).toFixed(1));
            }
            if (line) line.setAttribute('points', pts.join(' '));
            if (goal) {
                var y = target ? (H - 2 - target / top * (H - 4)).toFixed(1) : '-10';
                goal.setAttribute('y1', y);
                goal.setAttribute('y2', y);
            }
            svg.setAttribute('class', 'ai-menu__spark' + (level ? ' ai-menu__spark--' + level : ''));
        },

        _startStatusPoll: function() {
            var self = this;
            if (this._statusPollTimer) clearInterval(this._statusPollTimer);
            this._refreshStatusRow();
            this._statusPollTimer = setInterval(function() { self._refreshStatusRow(); }, 500);
        },

        toggleUpscalerMenu: function() {
            var existing = document.querySelector('#aiUpscalerQuickMenu');
            if (existing) {
                existing.remove();
                this._cleanupMenu();
                return;
            }

            // Read config first, then fetch model download states in parallel
            this.getPluginConfig().then(function(config) {
                PlayerIntegration._buildMenu(config, null);
                PlayerIntegration._fetchModelStates().then(function(states) {
                    PlayerIntegration._refreshModelStates(states);
                });
            }).catch(function(err) {
                console.error('Failed to load plugin config for menu:', err);
                PlayerIntegration._buildMenu({}, null);
            });
        },

        _fetchModelStates: function() {
            // Use ApiClient.ajax so the X-Emby-Token header is attached automatically.
            // Raw fetch() against /Upscaler/* returns 401 because the [Authorize] controller
            // needs Jellyfin's session token and ApiClient.getRequestHeader() doesn't exist.
            return ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl('Upscaler/models'),
                dataType: 'json'
            }).then(function(data) {
                var map = {};
                (data.models || []).forEach(function(m) {
                    map[m.id] = { downloaded: !!m.downloaded, available: m.available !== false, loaded: !!m.loaded, category: m.category };
                });
                return map;
            }).catch(function(err) {
                console.warn('AI Upscaler: could not fetch model states -', err && (err.message || err.status || err));
                return null;
            });
        },

        _isUpscalerState: function(state) {
            return !state || (state.available !== false &&
                ['interpolation', 'face_restore', 'face-restore', 'object-detection'].indexOf((state.category || '').toLowerCase()) === -1);
        },

        // One glyph set for every state change (render, refresh, load, failure).
        _stateGlyph: function(kind) {
            var icons = { ready: 'check_circle', 'need-dl': 'download', err: 'error_outline', unknown: 'more_horiz' };
            return '<span class="material-icons" aria-hidden="true">' + (icons[kind] || icons['need-dl']) + '</span>';
        },

        _renderModelCard: function(m, isActive, state) {
            if (!this._isUpscalerState(state)) return '';
            var esc = this._escapeHtml;
            var kind, title;
            if (state && !state.available) {
                kind = 'err'; title = 'Not yet available';
            } else if (state && state.downloaded) {
                kind = 'ready'; title = 'Downloaded and ready';
            } else if (state) {
                kind = 'need-dl'; title = 'Downloads on first use';
            } else {
                kind = 'unknown'; title = 'Status unknown';
            }
            // Favorites come from a config string, so ids and names are escaped here.
            var html = '<button class="ai-menu__model' + (isActive ? ' ai-menu__model--active' : '') +
                '" data-model="' + esc(m.id) + '" data-scale="' + esc(m.scale) + '" title="' + title +
                '" aria-pressed="' + (isActive ? 'true' : 'false') + '">';
            html += '<span class="ai-menu__radio" aria-hidden="true"></span>';
            html += '<span class="ai-menu__model-name">' + esc(m.name) + '</span>';
            if (m.badge) html += '<span class="ai-menu__badge">' + esc(m.badge) + '</span>';
            html += '<span class="ai-menu__model-scale">' + esc(m.scale) + '&times;</span>';
            html += '<span class="ai-menu__state ai-menu__state--' + (kind === 'unknown' ? 'need-dl' : kind) +
                '" data-state-slot="' + esc(m.id) + '">' + this._stateGlyph(kind) + '</span>';
            html += '</button>';
            return html;
        },

        _refreshModelStates: function(states) {
            if (!states) return;
            var menu = document.querySelector('#aiUpscalerQuickMenu');
            if (!menu) return;
            PlayerIntegration._modelStates = states;

            // Update summary counter
            var total = 0, ready = 0;
            Object.keys(states).forEach(function(k) {
                total++;
                if (states[k].downloaded) ready++;
            });
            var summ = menu.querySelector('[data-summary-ready]');
            if (summ) summ.textContent = ready + ' of ' + total;
            var summDot = menu.querySelector('.ai-menu__summary-dot');
            if (summDot) summDot.classList.toggle('ai-menu__summary-dot--off', ready === 0);

            // Update each state icon. A pinned favorite is listed twice (Favorites and its
            // own category), so every slot for the id is updated, not just the first.
            Object.keys(states).forEach(function(id) {
                var slots = menu.querySelectorAll('[data-state-slot="' + id + '"]');
                var s = states[id];
                var kind = !s.available ? 'err' : s.downloaded ? 'ready' : 'need-dl';
                for (var n = 0; n < slots.length; n++) {
                    var slot = slots[n];
                    if (!PlayerIntegration._isUpscalerState(s)) { slot.closest('button').remove(); continue; }
                    slot.classList.remove('ai-menu__state--ready','ai-menu__state--need-dl','ai-menu__state--busy','ai-menu__state--err');
                    slot.classList.add('ai-menu__state--' + kind);
                    slot.innerHTML = PlayerIntegration._stateGlyph(kind);
                }
            });
        },

        _applyChipFilter: function(menu, filter) {
            menu.querySelectorAll('.ai-menu__chip').forEach(function(c) {
                c.classList.toggle('ai-menu__chip--active', c.getAttribute('data-filter') === filter);
            });
            var states = PlayerIntegration._modelStates || {};
            menu.querySelectorAll('.ai-menu__model').forEach(function(btn) {
                var id = btn.getAttribute('data-model');
                var s = states[id] || {};
                var show = true;
                if (filter === 'ready') show = !!s.downloaded;
                else if (filter === 'recommended') show = ['realesrgan-x4','span-x2','clearreality-x4','ultrasharp-v2-x4','fsrcnn-x2'].indexOf(id) !== -1;
                btn.style.display = show ? '' : 'none';
            });
            menu.querySelectorAll('.ai-menu__cat').forEach(function(cat) {
                var visible = cat.querySelectorAll('.ai-menu__model:not([style*="display: none"])').length;
                cat.style.display = visible > 0 ? '' : 'none';
            });
        },

        _buildMenu: function(config, modelStates) {
            var position = (config.ButtonPosition || 'right').toLowerCase();
            var currentModel = config.Model || 'realesrgan-x4';
            var currentScale = config.ScaleFactor || 2;
            var isEnabled = config.EnablePlugin !== false;

            var menu = document.createElement('div');
            menu.id = 'aiUpscalerQuickMenu';
            menu.className = 'ai-menu ai-menu--' + position;
            menu.addEventListener('wheel', function(e) { e.stopPropagation(); }, { passive: true });
            menu.addEventListener('mousewheel', function(e) { e.stopPropagation(); }, { passive: true });
            menu.addEventListener('DOMMouseScroll', function(e) { e.stopPropagation(); }, { passive: true });
            menu.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
            menu.addEventListener('touchmove', function(e) { e.stopPropagation(); }, { passive: true });

            // Build category groups with state-aware model cards
            var modelsHtml = '';
            // v1.8.3.11 - pinned favorites first (the config page's star list)
            var favIds = (config.FavoriteModels || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean);
            if (favIds.length) {
                var flatCat = {};
                Object.keys(MODEL_CATALOG).forEach(function(fck) { MODEL_CATALOG[fck].models.forEach(function(fm) { flatCat[fm.id] = fm; }); });
                modelsHtml += '<div class="ai-menu__cat" data-cat="favorites">';
                modelsHtml += '<div class="ai-menu__cat-head"><span class="ai-menu__cat-name">\u2026 Favorites</span><span class="ai-menu__cat-desc">pinned on the config page</span></div>';
                for (var fvi = 0; fvi < favIds.length; fvi++) {
                    var favId = favIds[fvi];
                    var favM = flatCat[favId] || { id: favId, name: favId.replace(/^omdb-/, ''), scale: 2 };
                    modelsHtml += this._renderModelCard(favM, favId === currentModel, modelStates ? modelStates[favId] : null);
                }
                modelsHtml += '</div>';
            }
            var cats = Object.keys(MODEL_CATALOG);
            for (var ci = 0; ci < cats.length; ci++) {
                var catKey = cats[ci];
                var cat = MODEL_CATALOG[catKey];
                modelsHtml += '<div class="ai-menu__cat" data-cat="' + catKey + '">';
                modelsHtml += '<div class="ai-menu__cat-head">';
                modelsHtml += '<span class="ai-menu__cat-name">' + cat.label + '</span>';
                modelsHtml += '<span class="ai-menu__cat-desc">' + cat.desc + '</span>';
                modelsHtml += '</div>';
                for (var mi = 0; mi < cat.models.length; mi++) {
                    var m = cat.models[mi];
                    var isActive = m.id === currentModel;
                    var st = modelStates ? modelStates[m.id] : null;
                    modelsHtml += this._renderModelCard(m, isActive, st);
                }
                modelsHtml += '</div>';
            }

            // Scale buttons
            var scales = [2, 3, 4];
            var scaleHtml = '';
            for (var si = 0; si < scales.length; si++) {
                var s = scales[si];
                var sActive = s === currentScale;
                scaleHtml += '<button class="ai-menu__scale' + (sActive ? ' ai-menu__scale--active' : '') + '" data-scale-val="' + s +
                    '" aria-pressed="' + (sActive ? 'true' : 'false') + '">' + s + '&times;</button>';
            }

            // Count models for summary strip
            var totalModels = 0, readyModels = 0;
            if (modelStates) {
                Object.keys(modelStates).forEach(function(k) {
                    totalModels++;
                    if (modelStates[k].downloaded) readyModels++;
                });
            }

            // v1.6.1.13: tab panes replace the flat scroll. Each pane is rendered
            // but only the active one is visible - see ai-menu__pane--active in CSS.
            // Filter state is seeded synchronously from cached config + defaults;
            // then _loadFilterConfig() refreshes it from the server after menu mount.
            var filterState = this._filterState || this._defaultFilterState();
            var filtersHtml = this._buildFiltersPane(filterState);

            // The engines realtime playback can run on, in the order the Realtime tab lists them.
            var engines = [
                ['server', 'Server AI', 'Hardware GPU OpenCL Lanczos4 + Adaptive Sharpening on server. Real-time 60+ FPS.'],
                ['lanczos', 'WebGL (Lanczos3)', '36-tap Lanczos3 + CAS sharpening in browser. Pristine sub-pixel lines, 144+ FPS.'],
                ['anime4k', 'Anime4K v4.0.1', 'Mode A HQ, iGPU/UHD 730 presets, and CNN shaders for anime. 60-120 FPS.'],
                ['ai-webgpu', 'WebGPU AI', 'Real-ESRGAN Compact neural model in browser via WebGPU compute.']
            ];
            var enginesHtml = '';
            for (var ei = 0; ei < engines.length; ei++) {
                enginesHtml += '<li class="ai-menu__engine" data-engine="' + engines[ei][0] + '">' +
                    '<span class="ai-menu__engine-name">' + engines[ei][1] + '</span>' +
                    '<span class="ai-menu__engine-desc">' + engines[ei][2] + '</span></li>';
            }
            var activeA4kPreset = RealtimeUpscaler._getAnime4KPreset ? RealtimeUpscaler._getAnime4KPreset() : (localStorage.getItem('ai_upscaler_anime4k_preset') || 'mode-a');
            var isA4kActive = (RealtimeUpscaler._mode === 'anime4k' || (this._cachedConfig && this._cachedConfig.RealtimeMode === 'anime4k'));
            this._fpsHistory = [];

            menu.innerHTML =
                '<div class="ai-menu__grip" aria-hidden="true"></div>' +
                '<div class="ai-menu__header">' +
                    '<div class="ai-menu__brand">' +
                        '<span class="material-icons ai-menu__logo" aria-hidden="true">auto_awesome</span>' +
                        '<div>' +
                            '<div class="ai-menu__title">AI Upscaler</div>' +
                            '<div class="ai-menu__version">v' + PLUGIN_VERSION + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="ai-menu__header-right">' +
                        '<button class="ai-menu__switch' + (isEnabled ? ' ai-menu__switch--on' : '') + '" data-action="toggle" role="switch" aria-checked="' + (isEnabled ? 'true' : 'false') + '" aria-label="Upscaling" title="' + (isEnabled ? 'Disable' : 'Enable') + ' upscaling"></button>' +
                        '<button class="ai-menu__close" data-action="close" aria-label="Close"><span class="material-icons" aria-hidden="true">close</span></button>' +
                    '</div>' +
                '</div>' +
                // Live readout: frame rate and its 20 s trend, state, engine and model.
                '<div class="ai-menu__status" data-status-row>' +
                    '<div class="ai-menu__readout">' +
                        '<span class="ai-menu__status-fps" data-status-fps><b>-</b> fps</span>' +
                        '<svg class="ai-menu__spark" data-status-spark viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true">' +
                            '<line class="ai-menu__spark-target" x1="0" x2="120" y1="-10" y2="-10"></line>' +
                            '<polyline class="ai-menu__spark-line" points=""></polyline>' +
                        '</svg>' +
                        '<span class="ai-menu__pill">' +
                            '<span class="ai-menu__status-dot ai-menu__status-dot--off" data-status-dot></span>' +
                            '<span class="ai-menu__status-state" data-status-state>IDLE</span>' +
                        '</span>' +
                    '</div>' +
                    '<div class="ai-menu__status-meta">' +
                        '<span class="ai-menu__status-mode" data-status-mode>-</span>' +
                        '<span class="ai-menu__status-sep" aria-hidden="true">-</span>' +
                        '<span class="ai-menu__status-model" data-status-model>' + this._escapeHtml(currentModel) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="ai-menu__tabs" role="tablist">' +
                    // v1.8.3.18 - Auto leads. Auto mode is the default (EnableAutoModelSelection
                    // is true out of the box), so the first thing the panel should answer is
                    // "what is it doing to THIS video, and how do I stop it" - not "pick a model
                    // from a list", which is the Custom-mode question.
                    '<button class="ai-menu__tab ai-menu__tab--active" data-tab="auto" role="tab" aria-selected="true"><span class="material-icons" aria-hidden="true">auto_awesome</span><span>Auto</span><span class="ai-menu__tab-live" data-auto-live-dot></span></button>' +
                    '<button class="ai-menu__tab" data-tab="models" role="tab" aria-selected="false"><span class="material-icons" aria-hidden="true">grid_view</span><span>Models</span></button>' +
                    '<button class="ai-menu__tab" data-tab="filters" role="tab" aria-selected="false"><span class="material-icons" aria-hidden="true">tune</span><span>Filters</span><span class="ai-menu__tab-live" data-filter-live-dot></span></button>' +
                    '<button class="ai-menu__tab" data-tab="realtime" role="tab" aria-selected="false"><span class="material-icons" aria-hidden="true">bolt</span><span>Realtime</span></button>' +
                    '<button class="ai-menu__tab" data-tab="diag" role="tab" aria-selected="false"><span class="material-icons" aria-hidden="true">monitor_heart</span><span>Diag</span></button>' +
                '</div>' +
                '<div class="ai-menu__body">' +
                    // v1.8.3.18 - the auto pane. Everything here writes straight to the
                    // plugin config and takes effect on the running video; nothing needs
                    // the full configuration page. Contents are filled by _renderAutoPane
                    // once the config and the decision for this video have been fetched.
                    '<div class="ai-menu__pane ai-menu__pane--active" data-pane="auto" role="tabpanel">' +
                        '<div data-auto-body><div class="ai-menu__auto-loading">Reading the decision for this video&hellip;</div></div>' +
                    '</div>' +
                    '<div class="ai-menu__pane" data-pane="models" role="tabpanel">' +
                        '<div class="ai-menu__chips" role="group" aria-label="Show models">' +
                            '<button class="ai-menu__chip ai-menu__chip--active" data-filter="all">All</button>' +
                            '<button class="ai-menu__chip" data-filter="ready">Downloaded</button>' +
                            '<button class="ai-menu__chip" data-filter="recommended">Recommended</button>' +
                        '</div>' +
                        '<div class="ai-menu__models">' + modelsHtml + '</div>' +
                        '<div class="ai-menu__section">' +
                            '<div class="ai-menu__section-title"><span>Output scale</span><span class="ai-menu__section-sub">AI models keep their own factor</span></div>' +
                            '<div class="ai-menu__scales" role="group" aria-label="Output scale">' + scaleHtml + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="ai-menu__pane" data-pane="filters" role="tabpanel">' + filtersHtml + '</div>' +
                    '<div class="ai-menu__pane" data-pane="realtime" role="tabpanel">' +
                        '<div class="ai-menu__rt-card">' +
                            '<div class="ai-menu__rt-status">' +
                                '<span class="ai-menu__rt-indicator" id="aiRtIndicator"></span>' +
                                '<span class="ai-menu__rt-label">Realtime</span>' +
                                '<span class="ai-menu__rt-value" id="aiRtStatusValue">--</span>' +
                            '</div>' +
                            '<div class="ai-menu__rt-row">' +
                                '<button class="ai-menu__filter-btn ai-menu__filter-btn--primary" data-action="rt-toggle" data-rt-toggle>Start</button>' +
                                '<button class="ai-menu__filter-btn ai-menu__filter-btn--secondary" data-action="rt-switch" data-rt-switch disabled>Switch engine</button>' +
                            '</div>' +
                        '</div>' +
                        '<div class="ai-menu__section">' +
                            '<div class="ai-menu__section-title"><span>Engines</span><span class="ai-menu__section-sub">default set in All settings</span></div>' +
                            '<ul class="ai-menu__engines">' + enginesHtml + '</ul>' +
                        '</div>' +
                        '<div class="ai-menu__section" id="aiAnime4kPresetsSection" style="' + (isA4kActive ? '' : 'display:none;') + '">' +
                            '<div class="ai-menu__section-title"><span>Anime4K Model Pipeline</span><span class="ai-menu__section-sub">tuned for dGPU vs iGPU</span></div>' +
                            '<div class="ai-menu__chips" role="group" aria-label="Anime4K Preset">' +
                                '<button class="ai-menu__chip' + (activeA4kPreset === 'mode-c-igpu' ? ' ai-menu__chip--active' : '') + '" data-a4k-preset="mode-c-igpu">Mode C Archive / Denoise (UHD 730)</button>' +
                                '<button class="ai-menu__chip' + (activeA4kPreset === 'mode-c' ? ' ai-menu__chip--active' : '') + '" data-a4k-preset="mode-c">Mode C HQ (Denoise dGPU)</button>' +
                                '<button class="ai-menu__chip' + (activeA4kPreset === 'simple-m' ? ' ai-menu__chip--active' : '') + '" data-a4k-preset="simple-m">Medium CNN (Clean UHD 730)</button>' +
                                '<button class="ai-menu__chip' + (activeA4kPreset === 'simple-l' ? ' ai-menu__chip--active' : '') + '" data-a4k-preset="simple-l">Large CNN (Balanced)</button>' +
                                '<button class="ai-menu__chip' + (activeA4kPreset === 'mode-a' ? ' ai-menu__chip--active' : '') + '" data-a4k-preset="mode-a">Mode A (Clean 1080p)</button>' +
                                '<button class="ai-menu__chip' + (activeA4kPreset === 'mode-b' ? ' ai-menu__chip--active' : '') + '" data-a4k-preset="mode-b">Mode B (Soft Lines)</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="ai-menu__pane" data-pane="diag" role="tabpanel">' +
                        '<div class="ai-menu__section" style="padding-top:0">' +
                            '<div id="aiDiagLogs" style="font-family:monospace;font-size:11px;color:#eee;background:#141414;padding:8px;border-radius:4px;white-space:pre-wrap;height:300px;overflow-y:auto;border:1px solid #333">Fetching performance data...</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="ai-menu__footer">' +
                    '<span class="ai-menu__summary">' +
                        '<span class="ai-menu__summary-dot' + (readyModels > 0 ? '' : ' ai-menu__summary-dot--off') + '"></span>' +
                        '<span><span class="ai-menu__summary-strong" data-summary-ready>' + (totalModels ? (readyModels + ' of ' + totalModels) : '-') + '</span> models downloaded</span>' +
                    '</span>' +
                    '<button class="ai-menu__action" data-action="config">All settings<span class="material-icons" aria-hidden="true">chevron_right</span></button>' +
                '</div>';

            // After DOM insertion, show what realtime is doing and label its buttons to match.
            setTimeout(function() {
                var statusEl = document.getElementById('aiRtStatusValue');
                var indicator = document.getElementById('aiRtIndicator');
                if (!statusEl) return;
                var st = RealtimeUpscaler.getStatus();
                var rtMenu = statusEl.closest('.ai-menu');
                var toggleBtn = rtMenu && rtMenu.querySelector('[data-rt-toggle]');
                var switchBtn = rtMenu && rtMenu.querySelector('[data-rt-switch]');
                statusEl.textContent = st.active ? PlayerIntegration._modeLabel(st.mode) + ' - ' + st.fps + ' fps' : (st.reason || 'Stopped');
                statusEl.classList.toggle('ai-menu__rt-value--on', !!st.active);
                if (indicator) indicator.classList.toggle('ai-menu__rt-indicator--on', !!st.active);
                if (toggleBtn) toggleBtn.textContent = st.active ? 'Stop' : 'Start';
                if (switchBtn) {
                    switchBtn.disabled = !st.active;
                    switchBtn.textContent = !st.active ? 'Switch engine'
                        : st.mode === 'server' ? 'Switch to Lanczos' : 'Switch to Server AI';
                }
                var engineKey = st.mode === 'webgl' ? 'lanczos' : st.mode;
                var rows = rtMenu ? rtMenu.querySelectorAll('[data-engine]') : [];
                for (var r = 0; r < rows.length; r++) {
                    rows[r].classList.toggle('ai-menu__engine--on', !!st.active && rows[r].getAttribute('data-engine') === engineKey);
                }
            }, 50);

            document.body.appendChild(menu);

            // v1.6.1.13: apply any previously-chosen CSS filter and refresh the state
            // from the server so the filter pane shows the current saved preset.
            this._applyFilterState(filterState);
            this._loadFilterConfig();

            // v1.8.3.18 - Auto is the landing tab, so fill it right away instead of
            // waiting for a tab click the user has no reason to make.
            this._renderAutoPane(menu);

            // Any interaction on the menu keeps it alive - important for filter sliders
            // where users may drag for several seconds. _touchMenuTimer resets the auto-close.
            var touchTimer = function() { PlayerIntegration._touchMenuTimer(menu); };
            menu.addEventListener('pointerdown', touchTimer);
            // Remote controls and keyboards navigate with keys, not pointers: keep the
            // panel open while they do, and let Escape close it.
            menu.addEventListener('keydown', function(e) {
                touchTimer();
                if (e.key === 'Escape') {
                    menu.remove();
                    PlayerIntegration._cleanupMenu();
                }
            });
            menu.addEventListener('input', function(e) {
                touchTimer();
                var slider = e.target.closest('[data-slider]');
                if (slider) {
                    PlayerIntegration._onSliderInput(menu, slider);
                }
                var advInput = e.target.closest('[data-adv-slider]');
                if (advInput) PlayerIntegration._syncSliderFill(advInput);
            });
            menu.addEventListener('change', function(e) {
                var adv = e.target.closest('[data-adv-slider]');
                if (adv) PlayerIntegration._onAdvSliderChange(menu, adv);
            });

            // Event delegation (click)
            menu.addEventListener('click', function(e) {
                touchTimer();

                var tab = e.target.closest('[data-tab]');
                if (tab) {
                    PlayerIntegration._switchTab(menu, tab.getAttribute('data-tab'));
                    return;
                }
                // v1.8.3.18 - auto-pane switches. Checked before [data-preset] and
                // [data-filter] because those selectors are broad enough to swallow a
                // click that was meant for a switch.
                var autoSw = e.target.closest('[data-auto-toggle]');
                if (autoSw) {
                    PlayerIntegration._toggleAutoAspect(menu, autoSw.getAttribute('data-auto-toggle'));
                    return;
                }
                var engineTarget = e.target.closest('[data-engine]');
                if (engineTarget) {
                    var newMode = engineTarget.getAttribute('data-engine');
                    if (newMode === 'lanczos') newMode = 'webgl';
                    var a4kSec = menu.querySelector('#aiAnime4kPresetsSection');
                    if (a4kSec) a4kSec.style.display = (newMode === 'anime4k') ? '' : 'none';
                    if (RealtimeUpscaler._mode !== newMode) {
                        PlayerIntegration.updatePluginConfig({ RealtimeMode: newMode }).then(function() {
                            if (RealtimeUpscaler._active) {
                                RealtimeUpscaler.stop();
                                var video = PlayerIntegration.findVideoElement();
                                if (video) {
                                    var overrideConfig = Object.assign({}, PlayerIntegration._cachedConfig || {}, { RealtimeMode: newMode });
                                    PlayerIntegration._startRtWithConfig(video, overrideConfig);
                                }
                                PlayerIntegration.showPlayerNotification('Switched engine to ' + PlayerIntegration._modeLabel(newMode), 'info');
                            }
                        });
                        var rows = menu.querySelectorAll('[data-engine]');
                        for (var r = 0; r < rows.length; r++) {
                            rows[r].classList.toggle('ai-menu__engine--on', rows[r].getAttribute('data-engine') === engineTarget.getAttribute('data-engine'));
                        }
                        var switchBtn = menu.querySelector('[data-rt-switch]');
                        if (switchBtn) {
                            switchBtn.textContent = newMode === 'server' ? 'Switch to Lanczos' : 'Switch to Server AI';
                        }
                    }
                    return;
                }
                var a4kBtn = e.target.closest('[data-a4k-preset]');
                if (a4kBtn) {
                    var a4kPreset = a4kBtn.getAttribute('data-a4k-preset');
                    localStorage.setItem('ai_upscaler_anime4k_preset', a4kPreset);
                    var allA4kBtns = menu.querySelectorAll('[data-a4k-preset]');
                    for (var b = 0; b < allA4kBtns.length; b++) {
                        allA4kBtns[b].classList.toggle('ai-menu__chip--active', allA4kBtns[b].getAttribute('data-a4k-preset') === a4kPreset);
                    }
                    if (RealtimeUpscaler._active && RealtimeUpscaler._mode === 'anime4k') {
                        RealtimeUpscaler.stop();
                        var a4kVideo = PlayerIntegration.findVideoElement();
                        if (a4kVideo) RealtimeUpscaler.start(a4kVideo, PlayerIntegration._cachedConfig, RealtimeUpscaler._lastBenchmark);
                    }
                    PlayerIntegration.showPlayerNotification('Anime4K model: ' + a4kBtn.textContent, 'info');
                    return;
                }
                var presetBtn = e.target.closest('[data-preset]');
                if (presetBtn) {
                    PlayerIntegration._pickPreset(menu, presetBtn.getAttribute('data-preset'));
                    return;
                }
                var chip = e.target.closest('[data-filter]');
                if (chip) {
                    PlayerIntegration._applyChipFilter(menu, chip.getAttribute('data-filter'));
                    return;
                }
                var target = e.target.closest('[data-model]');
                if (target) {
                    PlayerIntegration.quickSetModel(target.getAttribute('data-model'));
                    return;
                }
                target = e.target.closest('[data-scale-val]');
                if (target) {
                    PlayerIntegration.setScale(parseInt(target.getAttribute('data-scale-val'), 10));
                    return;
                }
                target = e.target.closest('[data-action]');
                if (target) {
                    var action = target.getAttribute('data-action');
                    if (action === 'close') {
                        menu.remove();
                        PlayerIntegration._cleanupMenu();
                    } else if (action === 'toggle') {
                        PlayerIntegration.toggleUpscaling();
                    } else if (action === 'config') {
                        PlayerIntegration.openFullConfig();
                    } else if (action === 'auto-apply') {
                        PlayerIntegration._applyAutoNow(menu);
                    } else if (action === 'auto-refresh') {
                        PlayerIntegration._renderAutoPane(menu);
                    } else if (action === 'filter-suggest-apply') {
                        var key = target.getAttribute('data-preset-key');
                        target.disabled = true;
                        PlayerIntegration._applySuggestedFilter(key).then(function(ok) {
                            PlayerIntegration.showPlayerNotification(
                                ok ? ('Filter preset set to ' + key) : 'Nothing to apply', 'info');
                            // Re-render: the suggestion has to disappear now that it IS the
                            // current preset, otherwise it would invite an endless re-apply.
                            PlayerIntegration._renderAutoPane(menu);
                        }).catch(function(err) {
                            target.disabled = false;
                            PlayerIntegration.showPlayerNotification(
                                'Could not set the preset: ' + ((err && err.message) || 'unknown error'), 'warning');
                        });
                    } else if (action === 'filter-reset') {
                        PlayerIntegration._resetFilters(menu);
                    } else if (action === 'filter-save') {
                        PlayerIntegration._saveFilterConfig(menu, target);
                    } else if (action === 'filter-advanced-toggle') {
                        var adv = menu.querySelector('[data-adv-pane]');
                        if (adv) adv.classList.toggle('ai-menu__adv--open');
                        var advOpen = !!adv && adv.classList.contains('ai-menu__adv--open');
                        target.setAttribute('aria-expanded', advOpen ? 'true' : 'false');
                        var caret = target.querySelector('.ai-menu__adv-caret');
                        if (caret) caret.textContent = advOpen ? 'expand_less' : 'expand_more';
                    } else if (action === 'rt-toggle') {
                        if (RealtimeUpscaler._active) {
                            RealtimeUpscaler.stop();
                            PlayerIntegration.updatePluginConfig({ EnableRealtimeUpscaling: false });
                            PlayerIntegration.showPlayerNotification('Real-time upscaling stopped', 'warning');
                        } else {
                            PlayerIntegration.updatePluginConfig({ EnableRealtimeUpscaling: true }).then(function() { PlayerIntegration.startRealtimeUpscaling(); });
                            PlayerIntegration.showPlayerNotification('Real-time upscaling starting...', 'success');
                        }
                        menu.remove();
                        PlayerIntegration._cleanupMenu();
                    } else if (action === 'rt-switch') {
                        if (RealtimeUpscaler._active) {
                            var newMode = RealtimeUpscaler._mode === 'server' ? 'webgl' : 'server';
                            RealtimeUpscaler.stop();
                            var video = PlayerIntegration.findVideoElement();
                            if (video) {
                                var overrideConfig = Object.assign({}, PlayerIntegration._cachedConfig || {}, { RealtimeMode: newMode });
                                PlayerIntegration._startRtWithConfig(video, overrideConfig);
                            }
                            PlayerIntegration.showPlayerNotification('Switched to ' + newMode.toUpperCase(), 'info');
                        }
                        menu.remove();
                        PlayerIntegration._cleanupMenu();
                    }
                }
            });

            // Close on outside click
            this._cleanupMenu();
            this._menuCloseHandler = function(e) {
                if (!menu.contains(e.target) && e.target.id !== 'aiUpscalerButton') {
                    menu.remove();
                    PlayerIntegration._cleanupMenu();
                }
            };
            setTimeout(function() { document.addEventListener('click', PlayerIntegration._menuCloseHandler); }, 100);

            // Auto-close after 30s of no interaction. _touchMenuTimer resets this on
            // any click/input - important for filter sliders that users drag for seconds.
            this._touchMenuTimer(menu);

            // Start live status poll so users can see upscaling state + FPS + model
            // update in real time while the menu is open.
            this._startStatusPoll();
        },

        _touchMenuTimer: function(menu) {
            if (this._menuAutoCloseTimer) clearTimeout(this._menuAutoCloseTimer);
            this._menuAutoCloseTimer = setTimeout(function() {
                if (menu && menu.parentElement) menu.remove();
                PlayerIntegration._cleanupMenu();
            }, 30000);
        },

        // \u2500\u2500 v1.6.1.13: filter pane \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
        _defaultFilterState: function() {
            return {
                enabled: false,
                preset: 'none',
                brightness: 0, contrast: 0, saturation: 0,
                gamma: 1.0, sharpness: 0, colorTemperature: 6500,
                vignette: 0, filmGrain: 0, denoise: 0,
                canSave: false // set true after GET /filter-config response + admin check
            };
        },

        // Filled part of a range track, from the neutral point (0, or the minimum) to the
        // thumb, so a +/- slider shows which way it has been pushed.
        _sliderFill: function(min, max, value) {
            var span = (max - min) || 1;
            var pos = Math.max(0, Math.min(100, (value - min) / span * 100));
            var zero = Math.max(0, Math.min(100, (0 - min) / span * 100));
            return { from: Math.min(pos, zero).toFixed(1) + '%', to: Math.max(pos, zero).toFixed(1) + '%' };
        },

        _syncSliderFill: function(input) {
            if (!input || !input.style) return;
            var f = this._sliderFill(parseFloat(input.min), parseFloat(input.max), parseFloat(input.value));
            input.style.setProperty('--ai-from', f.from);
            input.style.setProperty('--ai-to', f.to);
        },

        _buildFiltersPane: function(st) {
            // Preset tiles. Each carries a small canvas that _paintPresetPreviews fills
            // with the current frame under that preset's filter.
            var chipsHtml = '';
            for (var i = 0; i < PRESET_LABELS.length; i++) {
                var key = PRESET_LABELS[i][0];
                var label = PRESET_LABELS[i][1];
                var isOn = st.preset === key;
                chipsHtml += '<button class="ai-menu__preset' + (isOn ? ' ai-menu__preset--active' : '') + '" data-preset="' + key +
                    '" aria-pressed="' + (isOn ? 'true' : 'false') + '">' +
                    '<canvas class="ai-menu__preset-preview" data-preset-preview="' + key + '" width="96" height="54" aria-hidden="true"></canvas>' +
                    '<span class="ai-menu__preset-name">' + label + '</span></button>';
            }

            // Live sliders (CSS filter on <video>)
            var slidersHtml = '';
            for (var j = 0; j < LIVE_SLIDERS.length; j++) {
                var s = LIVE_SLIDERS[j];
                var v = st[s.key];
                var fill = this._sliderFill(s.min, s.max, v);
                slidersHtml +=
                    '<div class="ai-menu__slider-row">' +
                        '<label class="ai-menu__slider-label" for="aiMenuSlider-' + s.key + '">' +
                            '<span class="material-icons ai-menu__slider-icon" aria-hidden="true">' + s.icon + '</span>' +
                            '<span>' + s.label + '</span>' +
                            '<span class="ai-menu__slider-val" data-slider-val="' + s.key + '">' + (v > 0 ? '+' : '') + v + '</span>' +
                        '</label>' +
                        '<input type="range" class="ai-menu__slider" id="aiMenuSlider-' + s.key + '" data-slider="' + s.key + '"' +
                               ' min="' + s.min + '" max="' + s.max + '" step="1" value="' + v + '"' +
                               ' style="--ai-from:' + fill.from + ';--ai-to:' + fill.to + '">' +
                    '</div>';
            }

            // Advanced (server-persisted) sliders - shown collapsed by default
            var adv = [
                { key: 'gamma', label: 'Gamma', min: 0.5, max: 2.5, step: 0.01, val: st.gamma },
                { key: 'sharpness', label: 'Sharpness', min: 0, max: 3, step: 0.1, val: st.sharpness },
                { key: 'colorTemperature', label: 'Color Temperature (K)', min: 3000, max: 10000, step: 100, val: st.colorTemperature },
                { key: 'vignette', label: 'Vignette', min: 0, max: 3, step: 0.1, val: st.vignette },
                { key: 'filmGrain', label: 'Film Grain', min: 0, max: 50, step: 1, val: st.filmGrain },
                { key: 'denoise', label: 'Denoise', min: 0, max: 10, step: 0.5, val: st.denoise }
            ];
            var advHtml = '';
            for (var k = 0; k < adv.length; k++) {
                var a = adv[k];
                var afill = this._sliderFill(a.min, a.max, a.val);
                advHtml +=
                    '<div class="ai-menu__adv-row">' +
                        '<label class="ai-menu__adv-label" for="aiMenuAdv-' + a.key + '">' + a.label +
                            '<span class="ai-menu__adv-val" data-adv-val="' + a.key + '">' + a.val + '</span>' +
                        '</label>' +
                        '<input type="range" class="ai-menu__adv-slider" id="aiMenuAdv-' + a.key + '" data-adv-slider="' + a.key + '"' +
                               ' min="' + a.min + '" max="' + a.max + '" step="' + a.step + '" value="' + a.val + '"' +
                               ' style="--ai-from:' + afill.from + ';--ai-to:' + afill.to + '">' +
                    '</div>';
            }

            return '' +
                '<div class="ai-menu__section">' +
                    '<div class="ai-menu__section-title">' +
                        '<span>Look</span>' +
                        '<span class="ai-menu__section-sub">live, no transcoding</span>' +
                    '</div>' +
                    '<div class="ai-menu__presets">' + chipsHtml + '</div>' +
                '</div>' +
                '<div class="ai-menu__section">' +
                    '<div class="ai-menu__section-title"><span>Fine-tune</span></div>' +
                    '<div class="ai-menu__sliders">' + slidersHtml + '</div>' +
                '</div>' +
                '<div class="ai-menu__section">' +
                    '<button class="ai-menu__adv-toggle" data-action="filter-advanced-toggle" aria-expanded="false">' +
                        '<span>Advanced <span class="ai-menu__adv-note">applies on next seek</span></span>' +
                        '<span class="material-icons ai-menu__adv-caret" aria-hidden="true">expand_more</span>' +
                    '</button>' +
                    '<div class="ai-menu__adv" data-adv-pane>' + advHtml + '</div>' +
                '</div>' +
                '<div class="ai-menu__filter-actions">' +
                    '<button class="ai-menu__filter-btn ai-menu__filter-btn--secondary" data-action="filter-reset">Reset</button>' +
                    '<button class="ai-menu__filter-btn ai-menu__filter-btn--primary" data-action="filter-save"' + (st.canSave ? '' : ' disabled title="Admin privileges required"') + '>Save</button>' +
                '</div>';
        },

        // ==================================================================
        // v1.8.3.18 - AUTO PANE
        //
        // Auto mode has been the default since v1.8.3.12, but the in-player panel
        // only ever offered the Custom-mode questions ("pick a model", "pick a
        // filter"). What it could not answer was the one that matters while a video
        // is running: what did auto decide for THIS file, why, and how do I turn it
        // off without leaving the player. Everything below writes to the plugin
        // config and takes effect immediately - no full configuration page, no reload.
        // ==================================================================

        // Everything the auto pane interpolates goes through this. Most of it is
        // server-generated, but ActiveFilterPreset and FaceRestoreModel are config
        // strings an admin can set to anything, and they land in innerHTML.
        // Same escape set as _escHtml in configurationpage.html.
        _escapeHtml: function(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        },

        // Ask the backend what auto would do for the video that is playing right now.
        // Resolves with the raw /recommend-model payload or null; never rejects, because
        // a panel that fails to open is worse than one showing "service unreachable".
        _fetchAutoDecision: function() {
            var video = this.findVideoElement();
            var w = (video && video.videoWidth) | 0;
            var h = (video && video.videoHeight) | 0;
            // v1.8.3.19 - whether the answer is about THIS file or a generic default.
            // With no video element the resolver is handed 0x0 and falls through to its
            // HD branch; presenting that as "running now" would state a default as a fact.
            var known = w > 0 && h > 0;
            var itemId = this._getPlayingItemId();
            var fetchItem = itemId && window.ApiClient
                ? window.ApiClient.getItem(ApiClient.getCurrentUserId(), itemId).catch(function() { return null; })
                : Promise.resolve(null);

            return fetchItem.then(function(item) {
                var genres = (item && Array.isArray(item.Genres)) ? item.Genres.join(',') : '';
                var url = ApiClient.getUrl('Upscaler/recommend-model') +
                    '?width=' + w + '&height=' + h + '&isBatch=false' +
                    (genres ? ('&genres=' + encodeURIComponent(genres)) : '');
                return ApiClient.ajax({ type: 'GET', url: url, dataType: 'json' })
                    .then(function(res) {
                        if (res) { res._sourceKnown = known; }
                        return res;
                    });
            }).catch(function() { return null; });
        },

        _autoRow: function(key, label, sub, on, disabled) {
            return '<div class="ai-menu__auto-row' + (disabled ? ' ai-menu__auto-row--off' : '') + '">' +
                       '<div class="ai-menu__auto-row-text">' +
                           '<span class="ai-menu__auto-row-label">' + label + '</span>' +
                           '<span class="ai-menu__auto-row-sub">' + sub + '</span>' +
                       '</div>' +
                       '<button class="ai-menu__switch ai-menu__switch--sm' + (on ? ' ai-menu__switch--on' : '') +
                           '" data-auto-toggle="' + key + '" role="switch" aria-checked="' + (on ? 'true' : 'false') +
                           '" aria-label="' + label + '"></button>' +
                   '</div>';
        },

        _renderAutoPane: function(menu) {
            var body = menu.querySelector('[data-auto-body]');
            if (!body) return;

            Promise.all([this.getPluginConfig(), this._fetchAutoDecision()]).then(function(res) {
                var cfg = res[0] || {};
                var pick = res[1];
                var autoOn = cfg.EnableAutoModelSelection !== false;
                var esc = PlayerIntegration._escapeHtml;

                var dot = menu.querySelector('[data-auto-live-dot]');
                if (dot) dot.classList.toggle('ai-menu__tab-live--on', autoOn);

                var html = '';

                // 1. The master switch. First, big, and honest about what "off" means.
                html += '<div class="ai-menu__auto-master' + (autoOn ? ' ai-menu__auto-master--on' : '') + '">' +
                            '<div class="ai-menu__auto-master-text">' +
                                '<span class="ai-menu__auto-master-title">Auto mode' +
                                    '<span class="ai-menu__auto-state">' + (autoOn ? 'ON' : 'OFF') + '</span></span>' +
                                '<span class="ai-menu__auto-master-sub">' + (autoOn
                                    ? 'Model is chosen per video from content, resolution and what your hardware can run.'
                                    : 'Your manual model, scale and filter settings apply exactly as configured.') + '</span>' +
                            '</div>' +
                            '<button class="ai-menu__switch' + (autoOn ? ' ai-menu__switch--on' : '') +
                                '" data-auto-toggle="master" role="switch" aria-checked="' + (autoOn ? 'true' : 'false') +
                                '" aria-label="Auto mode"></button>' +
                        '</div>';

                // 2. What it decided for THIS video, with the reasoning the resolver returns.
                if (pick && pick.success) {
                    var scaleNum = parseInt(pick.recommended_scale, 10) || 0;
                    var over = pick.substitution_reason
                        ? '<div class="ai-menu__auto-warn">' + esc(pick.substitution_reason) + '</div>' : '';
                    var sig = (pick.signals && pick.signals.length)
                        ? '<details class="ai-menu__auto-signals"><summary>What it looked at</summary><ul>' +
                          pick.signals.map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('') +
                          '</ul></details>'
                        : '';
                    // v1.8.3.19 - three honest headings instead of one confident one.
                    // Without video dimensions the answer is a default, not a decision
                    // about this file, and the output size is unknowable - so it is
                    // omitted rather than printed as the string "unknown output size".
                    var head = !pick._sourceKnown ? 'Default pick - start playback for this file'
                             : autoOn ? 'Running now' : 'Auto would pick';
                    html += '<div class="ai-menu__auto-card">' +
                                '<div class="ai-menu__auto-card-head">' +
                                    '<span class="ai-menu__auto-card-title">' + head + '</span>' +
                                    // Coerced rather than escaped: this is the only numeric
                                    // interpolation in the pane, and "every value entering
                                    // innerHTML is escaped or coerced" is a rule you can audit
                                    // at a glance - "this one is safe because of where it comes
                                    // from" is not.
                                    (scaleNum ? '<span class="ai-menu__auto-scale">' + scaleNum + '&times;</span>' : '') +
                                '</div>' +
                                '<div class="ai-menu__auto-model">' + esc(pick.recommended_model || '-') + '</div>' +
                                (pick._sourceKnown && pick.output_size ? '<div class="ai-menu__auto-size">' + esc(pick.output_size) + '</div>' : '') +
                                (pick._sourceKnown && pick.reason ? '<div class="ai-menu__auto-reason">' + esc(pick.reason) + '</div>' : '') +
                                over + sig +
                            '</div>';
                } else {
                    html += '<div class="ai-menu__auto-card ai-menu__auto-card--muted">' +
                                'No decision available - the AI service did not answer. ' +
                                'Auto never blocks playback: your configured model is used instead.' +
                            '</div>';
                }

                // 3. The filter SUGGESTION. Shown only when auto actually has a different
                //    opinion than your current preset - a suggestion that repeats what you
                //    already chose is noise. Applying is one click and goes through the
                //    same /filter-config save path as a manual pick; nothing happens on
                //    its own. Not shown in Custom mode: there is no auto decision to offer.
                var suggested = (pick && pick.recommended_filter) || '';
                var currentPreset = (cfg.ActiveFilterPreset || '').toLowerCase();
                if (autoOn && suggested && suggested !== 'none' && suggested.toLowerCase() !== currentPreset) {
                    html += '<div class="ai-menu__auto-suggest" data-filter-suggestion>' +
                                '<div class="ai-menu__auto-suggest-text">' +
                                    '<span class="ai-menu__auto-suggest-label">Suggested look' +
                                        (pick.filter_reason ? ' - ' + esc(pick.filter_reason) : '') + '</span>' +
                                    '<span class="ai-menu__auto-suggest-value">' + esc(suggested) +
                                        (currentPreset ? ' <span class="ai-menu__auto-suggest-cur">(now: ' + esc(cfg.ActiveFilterPreset) + ')</span>' : '') +
                                    '</span>' +
                                '</div>' +
                                '<button class="ai-menu__filter-btn ai-menu__filter-btn--primary" ' +
                                    'data-action="filter-suggest-apply" data-preset-key="' + esc(suggested) + '">Apply</button>' +
                            '</div>';
                }

                // 3. Live switches for the four things auto touches. Filters are listed
                //    but deliberately described as a suggestion: v1.8.3.14 stopped auto
                //    overwriting a preset the user picked, and this text must not
                //    promise otherwise.
                html += '<div class="ai-menu__section-title" style="margin-top:14px"><span>Live controls</span>' +
                        '<span class="ai-menu__section-sub">applies immediately</span></div>';
                html += PlayerIntegration._autoRow('filters', 'Video filters',
                            (cfg.ActiveFilterPreset && cfg.ActiveFilterPreset !== 'none')
                                ? 'Your preset: ' + esc(cfg.ActiveFilterPreset) + ' - auto only suggests, never overwrites'
                                : 'Auto may suggest a look for this content',
                            cfg.EnableVideoFilters === true, false);
                html += PlayerIntegration._autoRow('face', 'Face restoration',
                            esc(cfg.FaceRestoreModel || 'gfpgan-v1.4') + ' - sharpens faces, costs extra time per frame',
                            cfg.EnableFaceRestore === true, false);
                html += PlayerIntegration._autoRow('realtime', 'Real-time upscaling',
                            'Upscale during playback instead of only in batch jobs',
                            cfg.EnableRealtimeUpscaling !== false, false);
                html += PlayerIntegration._autoRow('mask', 'Cover objects',
                            esc(cfg.ObjectMaskClasses || 'animals') + ' - ' +
                            (cfg.ObjectMaskMode === 'blur' ? 'blurred' : 'covered with a box') +
                            '. Replaces upscaling on this stream: two inference passes per frame ' +
                            'do not keep up with playback',
                            cfg.EnableObjectMasking === true, false);

                html += '<div class="ai-menu__auto-actions">' +
                            '<button class="ai-menu__filter-btn ai-menu__filter-btn--primary" data-action="auto-apply"' +
                                (autoOn ? '' : ' disabled title="Turn auto mode on first"') + '>Re-apply to this video</button>' +
                            '<button class="ai-menu__filter-btn ai-menu__filter-btn--secondary" data-action="auto-refresh">Refresh</button>' +
                        '</div>';

                body.innerHTML = html;
            }).catch(function(err) {
                body.innerHTML = '<div class="ai-menu__auto-card ai-menu__auto-card--muted">Could not read the auto state: ' +
                    PlayerIntegration._escapeHtml((err && err.message) || 'unknown error') + '</div>';
            });
        },

        // One switch -> one config field -> immediate effect. Each branch states what
        // "immediate" means for that field, because they differ: two are read per frame,
        // one is read when the RT loop starts.
        _toggleAutoAspect: function(menu, key) {
            var map = {
                master: 'EnableAutoModelSelection',
                filters: 'EnableVideoFilters',
                face: 'EnableFaceRestore',
                realtime: 'EnableRealtimeUpscaling',
                mask: 'EnableObjectMasking'
            };
            var field = map[key];
            if (!field) return;

            this.getPluginConfig().then(function(cfg) {
                var next = !(key === 'realtime' ? (cfg.EnableRealtimeUpscaling !== false)
                          : key === 'master'   ? (cfg.EnableAutoModelSelection !== false)
                          : cfg[field] === true);
                var patch = {};
                patch[field] = next;
                return PlayerIntegration.updatePluginConfig(patch).then(function() {
                    PlayerIntegration.showPlayerNotification(
                        (key === 'master' ? 'Auto mode' :
                         key === 'filters' ? 'Video filters' :
                         key === 'face' ? 'Face restoration' : key === 'mask' ? 'Object masking' : 'Real-time upscaling') +
                        (next ? ' on' : ' off'), 'info');

                    // Real-time upscaling reads its config when the loop starts, so a
                    // toggle only takes hold if the loop is restarted.
                    if (key === 'realtime' || key === 'mask') {
                        PlayerIntegration.startRealtimeUpscaling();
                    }
                    PlayerIntegration._renderAutoPane(menu);
                });
            }).catch(function(err) {
                PlayerIntegration.showPlayerNotification(
                    'Could not save: ' + ((err && err.message) || 'unknown error'), 'warning');
            });
        },

        // Re-run the decision and hand it to the running upscaler, without a reload.
        _applyAutoNow: function(menu) {
            var generation = RealtimeUpscaler._generation;
            return this.getPluginConfig().then(function(cfg) {
                if (generation !== RealtimeUpscaler._generation) return;
                var video = PlayerIntegration.findVideoElement();
                if (!video) {
                    PlayerIntegration.showPlayerNotification('No video is playing', 'warning');
                    return;
                }
                return PlayerIntegration._autoSelectForVideo(video, cfg).then(function(pick) {
                    if (generation !== RealtimeUpscaler._generation) return;
                    if (!pick || !pick.model) {
                        PlayerIntegration.showPlayerNotification('Auto had nothing to apply', 'warning');
                        return;
                    }
                    // v1.8.3.20 - the model is applied, the filter is not: it is only
                    // ever offered as a suggestion below.
                    PlayerIntegration._startRtWithConfig(video, Object.assign({}, cfg, { Model: pick.model }));
                    var msg = 'Applied ' + pick.model + (pick.reason ? ' - ' + pick.reason : '');
                    PlayerIntegration.showPlayerNotification(msg, pick.substitutedFrom ? 'warning' : 'info');
                    PlayerIntegration._renderAutoPane(menu);
                });
            }).catch(function(err) {
                PlayerIntegration.showPlayerNotification(
                    'Apply failed: ' + ((err && err.message) || 'unknown error'), 'warning');
            });
        },

        _switchTab: function(menu, tabName) {
            var tabs = menu.querySelectorAll('[data-tab]');
            var panes = menu.querySelectorAll('[data-pane]');
            for (var i = 0; i < tabs.length; i++) {
                var on = tabs[i].getAttribute('data-tab') === tabName;
                tabs[i].classList.toggle('ai-menu__tab--active', on);
                tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
            }
            for (var j = 0; j < panes.length; j++) {
                panes[j].classList.toggle('ai-menu__pane--active', panes[j].getAttribute('data-pane') === tabName);
            }
            // v1.8.3.18 - the auto pane describes the video that is playing right now,
            // so it is re-read on every visit rather than cached from when the panel
            // opened. Seeking to a different episode changes the answer.
            if (tabName === 'auto') this._renderAutoPane(menu);
            if (tabName === 'filters') this._paintPresetPreviews(menu);
        },

        // Highlight one preset tile (or none, when the sliders made a custom look).
        _markPreset: function(menu, preset) {
            var presets = menu.querySelectorAll('[data-preset]');
            for (var i = 0; i < presets.length; i++) {
                var on = presets[i].getAttribute('data-preset') === preset;
                presets[i].classList.toggle('ai-menu__preset--active', on);
                presets[i].setAttribute('aria-pressed', on ? 'true' : 'false');
            }
        },

        // Paint each preset tile with the frame on screen right now, under that preset's
        // CSS filter, so the choice is "this, on my video" instead of a name. Drawing a
        // video into a canvas never reads pixels back, so a cross-origin stream is fine.
        _paintPresetPreviews: function(menu) {
            var tiles = menu.querySelectorAll('canvas[data-preset-preview]');
            var video = this.findVideoElement();
            var live = !!(video && video.readyState >= 2 && video.videoWidth > 0);
            for (var i = 0; i < tiles.length; i++) {
                var c = tiles[i];
                var ctx = c.getContext && c.getContext('2d');
                if (!ctx) continue;
                var drawn = false;
                if (live) {
                    try {
                        // Cover-crop the frame to the tile's shape.
                        var vw = video.videoWidth, vh = video.videoHeight, r = c.width / c.height;
                        var cw = Math.min(vw, vh * r), ch = cw / r;
                        ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, c.width, c.height);
                        drawn = true;
                    } catch (e) { drawn = false; }
                }
                if (!drawn) {
                    var g = ctx.createLinearGradient(0, 0, 0, c.height);
                    g.addColorStop(0, '#1d3b5a'); g.addColorStop(0.6, '#b7715a'); g.addColorStop(1, '#f2c37e');
                    ctx.fillStyle = g;
                    ctx.fillRect(0, 0, c.width, c.height);
                }
                c.style.filter = PRESET_CSS[c.getAttribute('data-preset-preview')] || 'none';
            }
        },

        _onSliderInput: function(menu, slider) {
            if (!this._filterState) this._filterState = this._defaultFilterState();
            var key = slider.getAttribute('data-slider');
            var v = parseInt(slider.value, 10) || 0;
            this._filterState[key] = v;
            // Any manual slider adjust transitions to 'custom' - clears preset highlight.
            this._filterState.preset = 'custom';
            this._filterState.enabled = true;
            var valEl = menu.querySelector('[data-slider-val="' + key + '"]');
            if (valEl) valEl.textContent = (v > 0 ? '+' : '') + v;
            this._syncSliderFill(slider);
            this._markPreset(menu, null);
            this._applyFilterState(this._filterState);
        },

        _onAdvSliderChange: function(menu, slider) {
            // Advanced sliders don't drive live CSS - they apply server-side on next seek.
            if (!this._filterState) this._filterState = this._defaultFilterState();
            var key = slider.getAttribute('data-adv-slider');
            var v = parseFloat(slider.value);
            if (!isNaN(v)) this._filterState[key] = v;
            var valEl = menu.querySelector('[data-adv-val="' + key + '"]');
            if (valEl) valEl.textContent = (key === 'colorTemperature' || key === 'filmGrain') ? v.toFixed(0) : v.toFixed(2);
            this._syncSliderFill(slider);
        },

        _pickPreset: function(menu, preset) {
            if (!this._filterState) this._filterState = this._defaultFilterState();
            this._filterState.preset = preset;
            this._filterState.enabled = (preset !== 'none');
            // Reset the 3 live sliders - presets define their own look.
            this._filterState.brightness = 0;
            this._filterState.contrast = 0;
            this._filterState.saturation = 0;
            // Reflect in UI
            this._markPreset(menu, preset);
            var sliders = menu.querySelectorAll('[data-slider]');
            for (var j = 0; j < sliders.length; j++) {
                sliders[j].value = 0;
                this._syncSliderFill(sliders[j]);
                var k = sliders[j].getAttribute('data-slider');
                var valEl = menu.querySelector('[data-slider-val="' + k + '"]');
                if (valEl) valEl.textContent = '0';
            }
            this._applyFilterState(this._filterState);
        },

        _composeCssFromState: function(st) {
            // Preset takes priority if the 3 live sliders are all zero.
            var allSlidersZero = (st.brightness === 0 && st.contrast === 0 && st.saturation === 0);
            if (st.preset && st.preset !== 'custom' && st.preset !== 'none' && allSlidersZero) {
                return PRESET_CSS[st.preset] || '';
            }
            if (st.preset === 'none' && allSlidersZero) return '';
            // Otherwise compose from live sliders.
            var parts = [];
            for (var i = 0; i < LIVE_SLIDERS.length; i++) {
                var s = LIVE_SLIDERS[i];
                var v = st[s.key];
                if (v !== 0) parts.push(s.toCss(v));
            }
            return parts.join(' ');
        },

        _applyFilterState: function(st) {
            var video = this.findVideoElement();
            if (!video) return;
            var css = this._composeCssFromState(st);
            video.style.filter = css || '';
            // A realtime client-side upscaler (Anime4K / WebGL / WebGPU) renders to a
            // canvas overlay (z-index 999) that covers the - often opacity:0 - <video>.
            // The CSS filter on the hidden video then has no visible effect, so apply it
            // to the visible canvas too. Without this the filters "don't take" whenever
            // realtime upscaling is on (which auto-starts on every video since 10.11).
            var parent = video.parentElement;
            if (parent) {
                var canvases = parent.querySelectorAll('canvas');
                for (var i = 0; i < canvases.length; i++) canvases[i].style.filter = css || '';
            }
            this._updateLiveDot(css.length > 0);
        },

        _updateLiveDot: function(isLive) {
            var dot = document.querySelector('[data-filter-live-dot]');
            if (dot) dot.classList.toggle('ai-menu__tab-live--on', isLive);
        },

        _loadFilterConfig: function() {
            if (!window.ApiClient) return;
            var self = this;
            var url = ApiClient.getUrl('Upscaler/filter-config');
            ApiClient.ajax({ type: 'GET', url: url, dataType: 'json' }).then(function(resp) {
                if (!resp) return;
                // Merge server state into client state. We preserve any slider moves
                // the user already made this session (don't clobber active edits).
                var cur = self._filterState;
                if (!cur || (cur.brightness === 0 && cur.contrast === 0 && cur.saturation === 0)) {
                    self._filterState = {
                        enabled: !!resp.enabled,
                        preset: resp.preset || 'none',
                        brightness: 0, contrast: 0, saturation: 0,
                        gamma: resp.gamma || 1.0,
                        sharpness: resp.sharpness || 0,
                        colorTemperature: resp.colorTemperature || 6500,
                        vignette: resp.vignette || 0,
                        filmGrain: resp.filmGrain || 0,
                        denoise: resp.denoise || 0,
                        canSave: true // server responded - we'll let the POST discover non-admin
                    };
                    self._applyFilterState(self._filterState);
                    // Update UI to reflect loaded state
                    var menu = document.querySelector('#aiUpscalerQuickMenu');
                    if (menu) {
                        self._markPreset(menu, self._filterState.preset);
                        // The pane was rendered before this answer arrived, with Save
                        // disabled; the server has now answered, so let the POST decide.
                        var save = menu.querySelector('[data-action="filter-save"]');
                        if (save) { save.disabled = false; save.removeAttribute('title'); }
                    }
                }
            }).catch(function(err) {
                console.warn('AI Upscaler: filter-config fetch failed:', err);
            });
        },

        _resetFilters: function(menu) {
            var canSave = !!(this._filterState && this._filterState.canSave);
            this._filterState = this._defaultFilterState();
            this._filterState.canSave = canSave;
            // Reflect default state in all controls
            var sliders = menu.querySelectorAll('[data-slider]');
            for (var i = 0; i < sliders.length; i++) {
                sliders[i].value = 0;
                this._syncSliderFill(sliders[i]);
                var k = sliders[i].getAttribute('data-slider');
                var valEl = menu.querySelector('[data-slider-val="' + k + '"]');
                if (valEl) valEl.textContent = '0';
            }
            // The advanced sliders reset too, so what they show matches what Save sends.
            var advSliders = menu.querySelectorAll('[data-adv-slider]');
            for (var a = 0; a < advSliders.length; a++) {
                var ak = advSliders[a].getAttribute('data-adv-slider');
                advSliders[a].value = this._filterState[ak];
                this._syncSliderFill(advSliders[a]);
                var advVal = menu.querySelector('[data-adv-val="' + ak + '"]');
                if (advVal) advVal.textContent = String(this._filterState[ak]);
            }
            this._markPreset(menu, 'none');
            this._applyFilterState(this._filterState);
            this.showPlayerNotification('Filters reset', 'info');
        },

        _saveFilterConfig: function(menu, btn) {
            var st = this._filterState;
            if (!st) return;
            if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
            var body = {
                enabled: st.enabled,
                preset: st.preset === 'custom' ? 'custom' : st.preset,
                brightness: Math.max(-1, Math.min(1, st.brightness * 0.02)),
                contrast: Math.max(0, Math.min(3, 1 + st.contrast * 0.02)),
                saturation: Math.max(0, Math.min(3, 1 + st.saturation * 0.01)),
                gamma: st.gamma,
                sharpness: st.sharpness,
                colorTemperature: Math.round(st.colorTemperature),
                vignette: st.vignette,
                filmGrain: Math.round(st.filmGrain),
                denoise: st.denoise
            };
            var url = ApiClient.getUrl('Upscaler/filter-config');
            ApiClient.ajax({
                type: 'POST', url: url, contentType: 'application/json',
                data: JSON.stringify(body), dataType: 'json'
            }).then(function() {
                PlayerIntegration.showPlayerNotification('Filter settings saved', 'success');
                if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
            }).catch(function(err) {
                var msg = 'Save failed - admin privileges required';
                if (err && err.status && err.status !== 403) msg = 'Save failed: HTTP ' + err.status;
                PlayerIntegration.showPlayerNotification(msg, 'warning');
                if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
            });
        },

        quickSetModel: function(model) {
            var self = this;
            var menu = document.querySelector('#aiUpscalerQuickMenu');
            // A pinned favorite has two rows (Favorites and its category); both follow the load.
            var modelBtns = menu ? Array.prototype.slice.call(menu.querySelectorAll('[data-model="' + model + '"]')) : [];
            var slots = menu ? Array.prototype.slice.call(menu.querySelectorAll('[data-state-slot="' + model + '"]')) : [];
            function showState(kind, html) {
                slots.forEach(function(slot) {
                    slot.classList.remove('ai-menu__state--ready', 'ai-menu__state--need-dl', 'ai-menu__state--busy', 'ai-menu__state--err');
                    slot.classList.add('ai-menu__state--' + kind);
                    slot.innerHTML = html;
                });
            }
            var state = (this._modelStates && this._modelStates[model]) || null;
            var needsDownload = state && !state.downloaded && state.available;

            // Block if model is not available at all
            if (state && !state.available) {
                this.showPlayerNotification(model + ' is not yet available', 'warning');
                return;
            }

            // Model loading changes the service used by the frame loop. Stop that
            // loop now and bind this entire startup to the same cancellation token.
            RealtimeUpscaler.stop();
            var generation = RealtimeUpscaler._generation;
            var loading = new AbortController();
            RealtimeUpscaler._startupController = loading;
            function current() { return generation === RealtimeUpscaler._generation && !loading.signal.aborted; }

            // Show inline spinner on the clicked model; keep menu open
            modelBtns.forEach(function(b) { b.classList.add('ai-menu__model--loading'); });
            showState('busy', '<div class="ai-menu__spinner"></div>');
            this.showPlayerNotification(
                (needsDownload ? 'Downloading ' : 'Loading ') + model + (needsDownload ? ' (may take 30-120s)' : '...'),
                'info'
            );

            return this.updatePluginConfig({ Model: model }).then(function() {
                if (!current()) return;
                var loadUrl = ApiClient.getUrl('Upscaler/models/load') + '?model_name=' + encodeURIComponent(model);
                return fetch(loadUrl, {
                    method: 'POST',
                    headers: { 'Authorization': 'MediaBrowser Token="' + ApiClient.accessToken() + '"' },
                    credentials: 'include',
                    signal: loading.signal
                }).then(function(r) {
                    if (!r.ok) {
                        return r.text().then(function(t) {
                            var detail = t;
                            try { var j = JSON.parse(t); detail = j.detail || j.message || t; } catch (e) {}
                            throw new Error('HTTP ' + r.status + ': ' + (detail || 'model load failed'));
                        });
                    }
                    return r.json().catch(function() { return {}; });
                });
            }).then(function() {
                if (!current()) return;
                // Update active styling + refresh states
                if (menu) {
                    menu.querySelectorAll('.ai-menu__model').forEach(function(b) {
                        b.classList.remove('ai-menu__model--active');
                        b.setAttribute('aria-pressed', 'false');
                    });
                }
                modelBtns.forEach(function(b) {
                    b.classList.remove('ai-menu__model--loading');
                    b.classList.add('ai-menu__model--active');
                    b.setAttribute('aria-pressed', 'true');
                });
                showState('ready', self._stateGlyph('ready'));
                if (self._modelStates && self._modelStates[model]) {
                    self._modelStates[model].downloaded = true;
                    self._modelStates[model].loaded = true;
                }
                self.showPlayerNotification('Model ready: ' + model, 'success');
                var video = self.findVideoElement();
                if (video) {
                    return self.getPluginConfig().then(function(cfg) {
                        if (!current()) return;
                        // Recheck HDR/driver/masking rules and benchmark this model;
                        // a result measured for the previous model is not reusable.
                        return self._startRtWithConfig(video, cfg);
                    });
                }
            }).catch(function(err) {
                if (!current()) return;
                console.error('AI Upscaler: quickSetModel failed', err);
                modelBtns.forEach(function(b) { b.classList.remove('ai-menu__model--loading'); });
                showState('err', self._stateGlyph('err'));
                var msg = (err && err.message) ? err.message : 'unknown error';
                // Surface config-specific hint when AI service token is missing
                if (/API_TOKEN|403|401/.test(msg)) {
                    msg = 'AI service auth not configured. Open Full Configuration \u2192 AI Service \u2192 set API Token.';
                }
                self.showPlayerNotification('Failed: ' + msg, 'error');
            }).finally(function() {
                if (RealtimeUpscaler._startupController === loading) RealtimeUpscaler._startupController = null;
            });
        },

        setScale: function(scale) {
            this.updatePluginConfig({ ScaleFactor: scale });
            this.showPlayerNotification('Scale: ' + scale + 'x', 'success');
            var menu = document.querySelector('#aiUpscalerQuickMenu');
            if (menu) menu.remove();
            this._cleanupMenu();
        },

        toggleUpscaling: function() {
            this.getPluginConfig().then(function(config) {
                var newState = !config.EnablePlugin;
                PlayerIntegration.updatePluginConfig({ EnablePlugin: newState });
                // Live-update switch visual without closing the menu
                var sw = document.querySelector('#aiUpscalerQuickMenu [data-action="toggle"]');
                if (sw) {
                    sw.classList.toggle('ai-menu__switch--on', newState);
                    sw.setAttribute('aria-checked', newState ? 'true' : 'false');
                    sw.title = (newState ? 'Disable' : 'Enable') + ' upscaling';
                }
                PlayerIntegration.showPlayerNotification(
                    'Upscaling ' + (newState ? 'enabled' : 'disabled'),
                    newState ? 'success' : 'warning'
                );
            }).catch(function(err) {
                console.error('AI Upscaler: config fetch failed', err);
                PlayerIntegration.showPlayerNotification('Failed to toggle upscaling', 'error');
            });
        },

        openFullConfig: function() {
            window.location.hash = '/configurationpage?name=' + encodeURIComponent('AI Upscaler Plugin');
            var menu = document.querySelector('#aiUpscalerQuickMenu');
            if (menu) menu.remove();
            this._cleanupMenu();
        },

        // v1.8.3.30, issue #77 - same defect as the config page had: every notification was
        // its own position:fixed element at the same corner, so a second one covered the
        // first instead of stacking. Host does the stacking; an identical message still on
        // screen restarts its timer rather than being duplicated; the stack is capped.
        _notifHost: function() {
            var host = document.querySelector('.ai-notif-host');
            if (!host) {
                host = document.createElement('div');
                host.className = 'ai-notif-host';
                document.body.appendChild(host);
            }
            return host;
        },

        showPlayerNotification: function(message, type) {
            type = type || 'info';
            var host = this._notifHost();

            var existing = host.querySelectorAll('.ai-notif');
            for (var i = 0; i < existing.length; i++) {
                if (existing[i].textContent === message) {
                    clearTimeout(existing[i]._aiTimer);
                    existing[i]._aiTimer = setTimeout(function (el) {
                        return function () { if (el.parentElement) el.remove(); };
                    }(existing[i]), 3000);
                    return;
                }
            }

            var notification = document.createElement('div');
            notification.className = 'ai-notif ai-notif--' + type;
            notification.textContent = message;
            host.appendChild(notification);

            while (host.children.length > 4) {
                clearTimeout(host.children[0]._aiTimer);
                host.children[0].remove();
            }

            notification._aiTimer = setTimeout(function() {
                if (notification.parentElement) notification.remove();
                var h = document.querySelector('.ai-notif-host');
                if (h && !h.children.length) h.remove();
            }, 3000);
        },

        findVideoElement: function() {
            return document.querySelector('video') ||
                   document.querySelector('#videoOsdPage video') ||
                   document.querySelector('.htmlvideoplayer video');
        },

        // v1.8.3.34 - which item and version are playing, as {itemId, mediaSourceId}.
        // Jellyfin 10.9+ plays at "#/video" with no id in the URL, so reading the hash
        // alone found nothing and 1.8.3.31-33 refused every video as "color metadata
        // unavailable" (#86, #87). Direct play names the item in the video's own source;
        // under hls.js that source is a blob:, and the newest PlaybackInfo or HLS request
        // stands in. The hash is still read for clients that put the id there.
        _getPlayingMedia: function(video) {
            video = video || this.findVideoElement();
            var ref = this._mediaRefFromUrl(video && (video.currentSrc || video.src));
            if (ref) return ref;
            this._collectMediaRequests();
            if (this._lastMediaRequest) return this._lastMediaRequest;
            var id = this._hashParam('id');
            return id ? { itemId: id, mediaSourceId: null } : null;
        },

        _getPlayingItemId: function() {
            var ref = this._getPlayingMedia();
            return ref ? ref.itemId : null;
        },

        _hashParam: function(name) {
            try {
                var hash = window.location.hash || '';
                var qIdx = hash.indexOf('?');
                if (qIdx < 0) return null;
                var params = hash.substring(qIdx + 1).split('&');
                for (var i = 0; i < params.length; i++) {
                    var kv = params[i].split('=');
                    if (kv[0] === name && kv[1]) return decodeURIComponent(kv[1]);
                }
            } catch (e) {}
            return null;
        },

        // Stream, HLS and PlaybackInfo URLs name the item and usually the version:
        // /Videos/{id}/stream.mkv?mediaSourceId=..., /videos/{id}/master.m3u8?MediaSourceId=...,
        // /Items/{id}/PlaybackInfo. Subtitle, trickplay and image URLs do not match.
        _MEDIA_URL: /\/(?:videos|items)\/([0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/(?:stream\b|master\.m3u8|main\.m3u8|live\.m3u8|hls|playbackinfo\b)/i,

        _mediaRefFromUrl: function(url) {
            var match = this._MEDIA_URL.exec(String(url || ''));
            if (!match) return null;
            var source = /[?&]mediasourceid=([^&#]+)/i.exec(url);
            var sourceId = source ? source[1] : null;
            try { sourceId = sourceId && decodeURIComponent(sourceId); } catch (e) {}
            return { itemId: match[1], mediaSourceId: sourceId };
        },

        // Playback requests this page has made; the one that started last wins. Under
        // hls.js they are the only local record of what the video element plays.
        _lastMediaRequest: null,
        _lastMediaRequestAt: -1,
        _mediaRequestObserver: null,

        _noteMediaRequests: function(entries) {
            for (var i = 0; entries && i < entries.length; i++) {
                var ref = this._mediaRefFromUrl(entries[i].name);
                if (ref && entries[i].startTime >= this._lastMediaRequestAt) {
                    this._lastMediaRequest = ref;
                    this._lastMediaRequestAt = entries[i].startTime;
                }
            }
        },

        // Started when the script loads, from index.html, so it sees every playback.
        _watchMediaRequests: function() {
            var self = this;
            try {
                var observer = new PerformanceObserver(function(list) { self._noteMediaRequests(list.getEntries()); });
                try {
                    observer.observe({ type: 'resource', buffered: true });
                } catch (e) {
                    // Older engines accept entryTypes only, without the earlier entries.
                    observer.observe({ entryTypes: ['resource'] });
                    this._noteMediaRequests(performance.getEntriesByType('resource'));
                }
                this._mediaRequestObserver = observer;
            } catch (e) {
                this._mediaRequestObserver = null;
            }
        },

        // An observer's callback runs as a low-priority task and can trail the first
        // frames, so a lookup takes the entries it still holds.
        _collectMediaRequests: function() {
            try {
                var observer = this._mediaRequestObserver;
                if (observer && typeof observer.takeRecords === 'function') {
                    this._noteMediaRequests(observer.takeRecords());
                } else if (!observer && window.performance && performance.getEntriesByType) {
                    this._noteMediaRequests(performance.getEntriesByType('resource'));
                }
            } catch (e) {}
        },

        // Auto-Mode: ask the plugin to pick the best model + filter for this video.
        // Returns a Promise<{model, filter}> or resolves with null on any failure.
        // Only kicks in when config.EnableAutoModelSelection === true (default false -
        // the user must opt in under Settings). No placeholder: the backend runs real
        // heuristics over genres/resolution/multi-frame-capability.
        _autoSelectForVideo: function(video, config) {
            if (!config || !config.EnableAutoModelSelection) return Promise.resolve(null);
            if (!video || !video.videoWidth || !video.videoHeight) return Promise.resolve(null);

            var w = video.videoWidth | 0;
            var h = video.videoHeight | 0;
            var itemId = this._getPlayingItemId();

            var fetchItem = itemId && window.ApiClient
                ? window.ApiClient.getItem(ApiClient.getCurrentUserId(), itemId).catch(function() { return null; })
                : Promise.resolve(null);

            return fetchItem.then(function(item) {
                var genres = (item && Array.isArray(item.Genres)) ? item.Genres.join(',') : '';
                var url = ApiClient.getUrl('Upscaler/recommend-model') +
                    '?width=' + w + '&height=' + h +
                    '&isBatch=false' +
                    (genres ? ('&genres=' + encodeURIComponent(genres)) : '');
                return ApiClient.ajax({ type: 'GET', url: url, dataType: 'json' })
                    .then(function(res) {
                        if (!res || !res.success) return null;
                        // v1.8.3.13 - the auto decision used to land in the developer
                        // console only; carry it out so the UI can show it.
                        var autoMsg = 'Auto: ' + res.recommended_model +
                            (res.reason ? ' - ' + res.reason : '');
                        if (res.substituted_from) {
                            autoMsg += ' (' + res.substituted_from + ' unavailable - stand-in used)';
                        }
                        console.log('AI Upscaler ' + autoMsg +
                            ' (' + w + 'x' + h + ', genres=' + (genres || 'none') + ')');
                        return {
                            model: res.recommended_model,
                            filter: res.recommended_filter,
                            reason: res.reason,
                            substitutedFrom: res.substituted_from
                        };
                    });
            }).catch(function(err) {
                console.warn('AI Upscaler Auto: recommend-model failed -', err && (err.message || err));
                return null;
            });
        },

        // v1.8.3.20 - auto no longer applies a filter, at all.
        //
        // The UI promised "AI picks model + filter per video" and the code half-kept it:
        // v1.8.3.14 stopped auto OVERWRITING a preset you had chosen, but it still wrote
        // its own choice whenever the field was empty - so the first playback silently
        // decided your look, and the setting then read as if you had picked it.
        //
        // Models are technique: swapping one for a hardware reason is a correction the
        // user cannot make better themselves. A filter is taste. Auto now surfaces its
        // suggestion in the Auto tab with an Apply button and writes nothing on its own.
        // ResolveFilterForVideo keeps its single caller - the display endpoint - which is
        // exactly what a suggestion needs.
        _applySuggestedFilter: function(presetKey) {
            if (!presetKey || presetKey === 'none') return Promise.resolve(false);
            return ApiClient.ajax({
                type: 'POST',
                url: ApiClient.getUrl('Upscaler/filter-config'),
                // v1.8.3.22 - the DTO is FilterConfigUpdate { Enabled, Preset, ... }
                // (UpscalerController.cs). This posted ActiveFilterPreset/EnableVideoFilters -
                // the CONFIG field names - so ASP.NET bound nothing, every property stayed
                // null, and the endpoint still answered success:true. The Apply button has
                // therefore never worked since it shipped in v1.8.3.20: the toast claimed the
                // preset was set, the config was untouched, and the suggestion came straight
                // back on the next render.
                data: JSON.stringify({ Preset: presetKey, Enabled: true }),
                contentType: 'application/json',
                dataType: 'json'
            }).then(function() { return true; });
        },

        startRealtimeUpscaling: function() {
            RealtimeUpscaler.stop();
            var generation = RealtimeUpscaler._generation;
            return this.getPluginConfig().then(function(config) {
                if (generation !== RealtimeUpscaler._generation) return;
                if (config.EnableRealtimeUpscaling === false && config.EnableObjectMasking !== true) return;

                var video = PlayerIntegration.findVideoElement();
                if (!video) {
                    console.log('AI Upscaler RT: No video element found');
                    return;
                }

                if (config.ClientDriverUpscalingActive === true || config.EnableObjectMasking === true) {
                    return PlayerIntegration._startRtWithConfig(video, config);
                }

                // Auto-Mode hook: if the user opted in, let the plugin pick model+filter
                // for *this* video based on genres + resolution. Overrides config.Model
                // for this session only - does not persist back to config.
                return PlayerIntegration._autoSelectForVideo(video, config).then(function(pick) {
                    if (generation !== RealtimeUpscaler._generation) return;
                    if (pick && pick.model) {
                        config = Object.assign({}, config, { Model: pick.model });
                        // v1.8.3.13 - say WHY, and never swap the model silently: a
                        // substitution (preferred model has no public ONNX) is shown as
                        // a warning instead of looking like a wrong pick.
                        // v1.8.3.20 - this used to read "Auto: <model> + <filter>", which
                        // was true only while auto applied the filter itself. It no longer
                        // does, so the notice names the model it really set and points at
                        // the tab where the look is OFFERED rather than implying it is on.
                        var notice = 'Auto: ' + pick.model;
                        if (pick.reason) notice += ' - ' + pick.reason;
                        if (pick.substitutedFrom) notice += ' (' + pick.substitutedFrom + ' unavailable - stand-in used)';
                        if (pick.filter && pick.filter !== 'none') notice += ' - look suggested in the Auto tab';
                        PlayerIntegration.showPlayerNotification(notice, pick.substitutedFrom ? 'warning' : 'info');
                    }
                    return PlayerIntegration._startRtWithConfig(video, config);
                });
            }).catch(function(err) {
                console.error('AI Upscaler: config fetch failed for RT upscaling', err);
            });
        },

        // Extracted from startRealtimeUpscaling so auto-select can supply an overridden config.
        // SDR transfer characteristics, as Jellyfin and ffprobe name them.
        _SDR_TRANSFERS: ['bt709', 'smpte170m', 'bt470m', 'bt470bg', 'gamma22', 'gamma28', 'smpte240m',
                         'iec61966-2-1', 'iec61966-2-4', 'bt1361e', 'bt2020-10', 'bt2020-12', 'srgb'],

        // The server's rule (HdrFrameContract.IsHdr): HDR needs positive evidence - an HDR
        // range from Jellyfin, a tagged transfer that is not SDR (PQ, HLG, or one this
        // plugin does not know), or BT.2020 primaries without an SDR transfer. Bit depth is
        // not evidence: 1.8.3.31/32 refused NTSC/PAL DVD rips and untagged 10-bit encodes
        // here, in every mode, with an HDR message.
        _isHdrStream: function(stream) {
            var range = String(stream.VideoRangeType || stream.VideoRange || '').toLowerCase();
            var transfer = String(stream.ColorTransfer || '').toLowerCase();
            var untagged = !transfer || transfer === 'unknown' || transfer === 'unspecified';
            var sdrTransfer = this._SDR_TRANSFERS.indexOf(transfer) !== -1;
            if (range && range !== 'sdr' && range !== 'unknown') return true;
            if (!untagged && !sdrTransfer) return true;
            return String(stream.ColorPrimaries || '').toLowerCase() === 'bt2020' && !sdrTransfer;
        },

        _readPlayingVideoStream: function(video) {
            var ref = this._getPlayingMedia(video);
            if (!ref) return Promise.resolve(null);
            var sameId = function(a, b) {
                return String(a || '').replace(/-/g, '').toLowerCase() === String(b || '').replace(/-/g, '').toLowerCase();
            };
            return Promise.resolve().then(function() {
                return ApiClient.getItem(ApiClient.getCurrentUserId(), ref.itemId);
            }).then(function(item) {
                if (!item) return null;
                // An item with several versions lists them all; read the one that plays.
                var sources = item.MediaSources || [];
                var source = null;
                for (var i = 0; ref.mediaSourceId && i < sources.length; i++) {
                    if (sameId(sources[i].Id, ref.mediaSourceId)) { source = sources[i]; break; }
                }
                var streams = (source && source.MediaStreams) || item.MediaStreams ||
                    (sources[0] && sources[0].MediaStreams) || [];
                return streams.find(function(s) { return s.Type === 'Video'; }) || null;
            }).catch(function() { return null; });
        },

        _startRtWithConfig: function(video, config) {
                RealtimeUpscaler.stop();
                var generation = RealtimeUpscaler._generation;
                if (config.ClientDriverUpscalingActive === true && config.EnableObjectMasking !== true) {
                    RealtimeUpscaler.start(video, config, null);
                    return Promise.resolve();
                }
                return this._readPlayingVideoStream(video).then(function(stream) {
                if (generation !== RealtimeUpscaler._generation) return;
                if (!stream || PlayerIntegration._isHdrStream(stream)) {
                    RealtimeUpscaler._mode = 'off';
                    RealtimeUpscaler._reason = !stream ? 'Video color metadata unavailable; realtime processing cannot be validated' :
                        'HDR realtime and masking are not supported. Use the PQ RGB16 batch pipeline; HLG is not supported.';
                    PlayerIntegration.showPlayerNotification(RealtimeUpscaler._reason, 'warning');
                    return;
                }
                var mode = (config.RealtimeMode || 'auto').toLowerCase();

                // Guards apply before model warmup, recommendation or benchmark work.
                if (config.ClientDriverUpscalingActive === true || config.EnableObjectMasking === true ||
                    ['auto', 'server'].indexOf(mode) === -1) {
                    RealtimeUpscaler.start(video, config, null);
                    return;
                }

                // Auto + Server modes require an active server-side model before the
                // benchmark (otherwise /benchmark-frame returns 400 "No model loaded",
                // the auto-tier picks WebGL, and server-mode never engages).
                var startup = new AbortController();
                RealtimeUpscaler._startupController = startup;
                function current() { return generation === RealtimeUpscaler._generation && !startup.signal.aborted; }
                var nativeW = video.videoWidth || 1280;
                var nativeH = video.videoHeight || 720;
                var configuredW = (config && typeof config.RealtimeCaptureWidth === 'number') ? config.RealtimeCaptureWidth : 0;
                var captureW = configuredW > 0 ? configuredW : nativeW;
                var captureH = configuredW > 0 ? Math.round(captureW * (nativeH / nativeW)) : nativeH;
                if (captureH > 720) {
                    captureW = Math.round(captureW * (720 / captureH));
                    captureH = 720;
                }
                var modelName = config.Model || 'gpu-fast-x2';
                if ((mode === 'server' || mode === 'auto') && (!config.Model || config.Model === 'fsrcnn-x2' || config.Model === 'ncnn-realesrgan-anime-x2')) {
                    modelName = 'gpu-fast-x2';
                }
                var authHeaders = { 'Authorization': 'MediaBrowser Token="' + ApiClient.accessToken() + '"' };

                var runBenchmarkAndStart = function() {
                    if (!current()) return;
                    fetch(ApiClient.getUrl('Upscaler/benchmark-frame') + '?width=' + captureW + '&height=' + captureH, {
                        headers: authHeaders, signal: startup.signal
                    }).then(function(r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
                        .then(function(bench) {
                            if (!current()) return;
                            bench.videoFps = stream && (stream.AverageFrameRate || stream.RealFrameRate);
                            console.log('AI Upscaler RT: Benchmark result', bench);
                            RealtimeUpscaler.start(video, config, bench);
                        })
                        .catch(function(err) {
                            if (!current()) return;
                            console.warn('AI Upscaler RT: Benchmark failed, using WebGL', err);
                            RealtimeUpscaler.start(video, config, { error: 'benchmark failed' });
                        });
                };

                fetch(ApiClient.getUrl('Upscaler/models/load') + '?model_name=' + encodeURIComponent(modelName), {
                    method: 'POST',
                    headers: authHeaders, signal: startup.signal
                })
                    .then(function(r) {
                        if (!r.ok) {
                            console.warn('AI Upscaler RT: Model preload failed (HTTP ' + r.status + '), running benchmark anyway');
                        }
                        runBenchmarkAndStart();
                    })
                    .catch(function(err) {
                        console.warn('AI Upscaler RT: Model preload network error, running benchmark anyway', err);
                        runBenchmarkAndStart();
                    });
                });
        },

        addKeyboardShortcuts: function() {
            document.addEventListener('keydown', function(e) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
                if (e.altKey && e.key === 'u') {
                    e.preventDefault();
                    PlayerIntegration.toggleUpscaling();
                }
                if (e.altKey && e.key === 'm') {
                    e.preventDefault();
                    PlayerIntegration.toggleUpscalerMenu();
                }
            });
        },

        _startMutationObserver: function() {
            if (this._mutationObserver) return;
            var self = this;
            this._mutationObserver = new MutationObserver(function() {
                if (!self.isVideoPage() && !document.querySelector('video')) return;
                var target = self._findTargetContainer();
                var btn = document.getElementById('aiUpscalerButton');
                if (!btn || !target || btn.parentElement !== target.container) {
                    self._buttonInjected = false;
                    self.injectPlayerButton();
                }
            });
            this._mutationObserver.observe(document.body, { childList: true, subtree: true });

            // Clean up observer on SPA page navigation
            if (!this._viewHideCleanupBound) {
                this._viewHideCleanupBound = true;
                document.addEventListener('viewbeforehide', function() {
                    PlayerIntegration._buttonInjected = false;
                    if (!PlayerIntegration.isVideoPage() && !document.querySelector('video')) {
                        PlayerIntegration._stopMutationObserver();
                    }
                });
            }
        },

        _stopMutationObserver: function() {
            if (this._mutationObserver) {
                this._mutationObserver.disconnect();
                this._mutationObserver = null;
            }
        },

        addStyles: function() {
            if (this._stylesInjected) return;
            if (document.getElementById('aiUpscalerPlayerStyles')) { this._stylesInjected = true; return; }

            var styles = document.createElement('style');
            styles.id = 'aiUpscalerPlayerStyles';
            styles.textContent = [
                /* Player toolbar button */
                '#aiUpscalerButton{display:inline-flex!important;align-items:center;justify-content:center;min-width:40px;min-height:40px;margin:0 2px;color:#e6e8ec;cursor:pointer;background:transparent;border:none;outline:none;transition:color .15s,transform .1s}',
                '#aiUpscalerButton:hover{color:#00a4dc!important}',
                '#aiUpscalerButton:active{transform:scale(.92)}',
                '#aiUpscalerButton .material-icons{font-size:24px!important;line-height:1!important;display:inline-block!important}',

                /* Panel shell */
                '.ai-menu{--ai-glass:rgba(12,14,19,.8);--ai-solid:#0f1217;--ai-raise:rgba(255,255,255,.055);--ai-raise-2:rgba(255,255,255,.09);--ai-line:rgba(255,255,255,.09);--ai-line-2:rgba(255,255,255,.18);--ai-text:#f1f3f6;--ai-dim:#aab2bf;--ai-faint:#7d8594;--ai-accent:#00a4dc;--ai-accent-ink:#7fd3f2;--ai-accent-bg:rgba(0,164,220,.16);--ai-good:#3ddc97;--ai-warn:#f5b94a;--ai-bad:#ff6b6b;--ai-mono:ui-monospace,"SF Mono","Cascadia Mono","Roboto Mono",Menlo,Consolas,monospace;' +
                    'position:fixed;bottom:96px;z-index:100000;width:400px;max-width:calc(100vw - 32px);max-height:calc(100vh - 128px);display:flex;flex-direction:column;background:var(--ai-solid);color:var(--ai-text);border:1px solid var(--ai-line);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.55),0 2px 8px rgba(0,0,0,.35);overflow:hidden;font-family:"Noto Sans",-apple-system,"Segoe UI",system-ui,sans-serif;font-size:13px;line-height:1.45;text-align:left;animation:aiMenuIn .2s cubic-bezier(.2,.8,.2,1)}',
                '@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.ai-menu{background:var(--ai-glass);-webkit-backdrop-filter:blur(22px) saturate(1.35);backdrop-filter:blur(22px) saturate(1.35)}}',
                '.ai-menu--right{right:24px}.ai-menu--left{left:24px}.ai-menu--center{left:50%;transform:translateX(-50%);animation-name:aiMenuInCenter}',
                '@keyframes aiMenuIn{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}',
                '@keyframes aiMenuInCenter{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%)}}',
                '.ai-menu *{box-sizing:border-box}',
                '.ai-menu .material-icons{font-size:18px;line-height:1}',
                '.ai-menu__switch,.ai-menu__close,.ai-menu__tab,.ai-menu__chip,.ai-menu__model,.ai-menu__scale,.ai-menu__preset,.ai-menu__adv-toggle,.ai-menu__filter-btn,.ai-menu__action{font-family:inherit;-webkit-appearance:none;appearance:none;margin:0}',
                /* Focus: visible for keyboards and TV remotes; hidden for mouse clicks where supported */
                '.ai-menu button:focus,.ai-menu input:focus,.ai-menu summary:focus{outline:2px solid var(--ai-accent);outline-offset:2px}',
                '.ai-menu button:focus:not(:focus-visible),.ai-menu input:focus:not(:focus-visible),.ai-menu summary:focus:not(:focus-visible){outline:none}',

                /* Header */
                '.ai-menu__grip{display:none}',
                '.ai-menu__header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 12px 12px 16px;flex-shrink:0}',
                '.ai-menu__brand{display:flex;align-items:center;gap:11px;min-width:0}',
                '.ai-menu .ai-menu__logo{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--ai-accent-bg);color:var(--ai-accent-ink);font-size:18px}',
                '.ai-menu__title{font-size:15px;font-weight:700;letter-spacing:.005em;line-height:1.15}',
                '.ai-menu__version{margin-top:3px;font:500 11px/1 var(--ai-mono);color:var(--ai-faint)}',
                '.ai-menu__header-right{display:flex;align-items:center;gap:6px}',
                '.ai-menu__close{width:34px;height:34px;padding:0;border:0;border-radius:10px;background:transparent;color:var(--ai-dim);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s}',
                '.ai-menu__close:hover{background:var(--ai-raise-2);color:var(--ai-text)}',
                '.ai-menu .ai-menu__close .material-icons{font-size:20px}',

                /* Switches */
                '.ai-menu__switch{position:relative;width:44px;height:26px;padding:0;flex-shrink:0;border-radius:13px;border:1px solid var(--ai-line-2);background:rgba(255,255,255,.08);cursor:pointer;transition:background .18s,border-color .18s}',
                '.ai-menu__switch::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#c9cfd8;box-shadow:0 1px 3px rgba(0,0,0,.45);transition:transform .18s cubic-bezier(.2,.8,.2,1),background .18s}',
                '.ai-menu__switch--on{background:var(--ai-accent);border-color:var(--ai-accent)}',
                '.ai-menu__switch--on::after{transform:translateX(18px);background:#fff}',
                '.ai-menu__switch--sm{width:38px;height:22px;border-radius:11px}',
                '.ai-menu__switch--sm::after{width:14px;height:14px}',
                '.ai-menu__switch--sm.ai-menu__switch--on::after{transform:translateX(16px)}',

                /* Live readout: frame rate, its trend against the video rate, state, engine, model */
                '.ai-menu__status{margin:0 12px;padding:12px 14px 11px;border-radius:12px;background:var(--ai-raise);border:1px solid var(--ai-line);flex-shrink:0}',
                '.ai-menu__readout{display:flex;align-items:center;gap:12px}',
                '.ai-menu__status-fps{display:flex;align-items:baseline;gap:5px;min-width:70px;font:500 12px/1 var(--ai-mono);color:var(--ai-faint);white-space:nowrap}',
                '.ai-menu__status-fps b{font:600 28px/1 var(--ai-mono);letter-spacing:-.03em;color:var(--ai-text);font-variant-numeric:tabular-nums}',
                '.ai-menu__status-fps--warn b{color:var(--ai-warn)}',
                '.ai-menu__status-fps--err b{color:var(--ai-bad)}',
                '.ai-menu__spark{flex:1;min-width:0;height:36px;overflow:visible}',
                '.ai-menu__spark-line{fill:none;stroke:var(--ai-good);stroke-width:1.75;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}',
                '.ai-menu__spark--warn .ai-menu__spark-line{stroke:var(--ai-warn)}',
                '.ai-menu__spark--err .ai-menu__spark-line{stroke:var(--ai-bad)}',
                '.ai-menu__spark-target{stroke:var(--ai-line-2);stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}',
                '.ai-menu__pill{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;padding:5px 9px;border-radius:999px;background:rgba(255,255,255,.07)}',
                '.ai-menu__status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;background:var(--ai-faint)}',
                '.ai-menu__status-dot--on{background:var(--ai-good);box-shadow:0 0 0 3px rgba(61,220,151,.18);animation:aiPulse 2.4s ease-in-out infinite}',
                '.ai-menu__status-dot--off{background:var(--ai-faint)}',
                '.ai-menu__status-dot--warn{background:var(--ai-warn)}',
                '.ai-menu__status-dot--err{background:var(--ai-bad)}',
                '@keyframes aiPulse{0%,100%{opacity:1}50%{opacity:.55}}',
                '.ai-menu__status-state{font:700 10.5px/1 var(--ai-mono);letter-spacing:.08em;color:var(--ai-text)}',
                '.ai-menu__status-meta{display:flex;align-items:center;gap:7px;min-width:0;margin-top:10px;font-size:12px;color:var(--ai-dim)}',
                '.ai-menu__status-mode{flex-shrink:0;font-weight:700;color:var(--ai-accent-ink);white-space:nowrap}',
                '.ai-menu__status-sep{color:var(--ai-faint)}',
                '.ai-menu__status-model{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 12px/1.3 var(--ai-mono)}',

                /* Tabs: one segmented control */
                '.ai-menu__tabs{display:flex;gap:4px;margin:12px 12px 0;padding:4px;flex-shrink:0;border-radius:12px;background:rgba(0,0,0,.28);border:1px solid var(--ai-line)}',
                '.ai-menu__tab{position:relative;flex:1;min-width:0;min-height:38px;display:flex;align-items:center;justify-content:center;gap:6px;padding:6px 4px;border:0;border-radius:9px;background:transparent;color:var(--ai-dim);font-size:12.5px;font-weight:600;white-space:nowrap;cursor:pointer;transition:background .15s,color .15s}',
                '.ai-menu .ai-menu__tab .material-icons{font-size:17px}',
                '.ai-menu__tab:hover{color:var(--ai-text);background:rgba(255,255,255,.05)}',
                '.ai-menu__tab--active,.ai-menu__tab--active:hover{background:var(--ai-raise-2);color:var(--ai-text);box-shadow:inset 0 0 0 1px var(--ai-line)}',
                '.ai-menu .ai-menu__tab--active .material-icons{color:var(--ai-accent-ink)}',
                '.ai-menu__tab-live{position:absolute;top:6px;right:7px;width:6px;height:6px;border-radius:50%;background:transparent}',
                '.ai-menu__tab-live--on{background:var(--ai-good)}',

                /* Body and panes */
                '.ai-menu__body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:14px 12px 14px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.2) transparent}',
                '.ai-menu__body::-webkit-scrollbar{width:10px}',
                '.ai-menu__body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border:3px solid transparent;border-radius:5px;background-clip:padding-box}',
                '.ai-menu__body::-webkit-scrollbar-track{background:transparent}',
                '.ai-menu__pane{display:none}',
                '.ai-menu__pane--active{display:block;animation:aiFade .16s ease-out}',
                '@keyframes aiFade{from{opacity:0}to{opacity:1}}',
                '.ai-menu__section{margin-top:18px}',
                '.ai-menu__section:first-child{margin-top:0}',
                '.ai-menu__section-title{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:0 2px 9px;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ai-faint)}',
                '.ai-menu__section-sub{font-size:11px;font-weight:500;letter-spacing:0;text-transform:none;color:var(--ai-faint);text-align:right}',

                /* Models: filter chips, groups, rows */
                '.ai-menu__chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}',
                '.ai-menu__chip{min-height:32px;padding:5px 13px;border-radius:999px;border:1px solid var(--ai-line);background:transparent;color:var(--ai-dim);font-size:12.5px;font-weight:600;cursor:pointer;transition:background .15s,color .15s,border-color .15s}',
                '.ai-menu__chip:hover{color:var(--ai-text);border-color:var(--ai-line-2)}',
                '.ai-menu__chip--active,.ai-menu__chip--active:hover{background:var(--ai-accent-bg);border-color:rgba(0,164,220,.55);color:var(--ai-accent-ink)}',
                '.ai-menu__cat{margin-bottom:16px}',
                '.ai-menu__cat:last-child{margin-bottom:0}',
                '.ai-menu__cat-head{display:flex;align-items:baseline;gap:8px;padding:0 4px 7px}',
                '.ai-menu__cat-name{font-size:12.5px;font-weight:700;color:var(--ai-text)}',
                '.ai-menu__cat-desc{font-size:11.5px;color:var(--ai-faint)}',
                '.ai-menu__model{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;margin:0 0 4px;padding:8px 10px 8px 12px;border-radius:10px;border:1px solid transparent;background:var(--ai-raise);color:var(--ai-text);font-size:13px;text-align:left;cursor:pointer;transition:background .12s,border-color .12s}',
                '.ai-menu__model:hover{background:var(--ai-raise-2)}',
                '.ai-menu__model--active,.ai-menu__model--active:hover{background:var(--ai-accent-bg);border-color:rgba(0,164,220,.5)}',
                '.ai-menu__model--loading{opacity:.65;pointer-events:none}',
                '.ai-menu__radio{width:16px;height:16px;flex-shrink:0;border-radius:50%;border:2px solid var(--ai-line-2);transition:border-color .15s}',
                '.ai-menu__model--active .ai-menu__radio{border-color:var(--ai-accent);background:radial-gradient(circle,var(--ai-accent) 0,var(--ai-accent) 3.5px,transparent 4.5px)}',
                '.ai-menu__model-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
                '.ai-menu__badge{flex-shrink:0;padding:3px 7px;border-radius:6px;background:rgba(255,255,255,.07);color:var(--ai-dim);font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}',
                '.ai-menu__model--active .ai-menu__badge{background:rgba(0,164,220,.22);color:var(--ai-accent-ink)}',
                '.ai-menu__model-scale{flex-shrink:0;min-width:26px;text-align:right;font:600 12px/1 var(--ai-mono);color:var(--ai-dim)}',
                '.ai-menu__state{width:20px;height:20px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--ai-faint)}',
                '.ai-menu .ai-menu__state .material-icons{font-size:18px}',
                '.ai-menu__state--ready{color:var(--ai-good)}',
                '.ai-menu__state--need-dl{color:var(--ai-faint)}',
                '.ai-menu__state--busy{color:var(--ai-accent-ink)}',
                '.ai-menu__state--err{color:var(--ai-bad)}',
                '.ai-menu__spinner{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.14);border-top-color:var(--ai-accent);animation:aiSpin .7s linear infinite}',
                '@keyframes aiSpin{to{transform:rotate(360deg)}}',
                '.ai-menu__scales{display:flex;gap:4px;padding:4px;border-radius:12px;background:rgba(0,0,0,.28);border:1px solid var(--ai-line)}',
                '.ai-menu__scale{flex:1;min-height:38px;border:0;border-radius:9px;background:transparent;color:var(--ai-dim);font:600 13px/1 var(--ai-mono);cursor:pointer;transition:background .15s,color .15s}',
                '.ai-menu__scale:hover{color:var(--ai-text)}',
                '.ai-menu__scale--active,.ai-menu__scale--active:hover{background:var(--ai-raise-2);color:var(--ai-text);box-shadow:inset 0 0 0 1px var(--ai-line)}',

                /* Filters: preset tiles with a live preview of the current frame */
                '.ai-menu__presets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
                '.ai-menu__preset{display:flex;flex-direction:column;gap:6px;padding:4px 4px 7px;min-width:0;border-radius:11px;border:1px solid transparent;background:var(--ai-raise);color:var(--ai-dim);font-size:11.5px;font-weight:600;text-align:center;cursor:pointer;transition:background .12s,border-color .12s,color .12s}',
                '.ai-menu__preset:hover{background:var(--ai-raise-2);color:var(--ai-text)}',
                '.ai-menu__preset--active,.ai-menu__preset--active:hover{border-color:var(--ai-accent);background:var(--ai-accent-bg);color:var(--ai-text)}',
                '.ai-menu__preset-preview{display:block;width:100%;height:auto;border-radius:8px;background:#1b2330}',
                '.ai-menu__preset-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
                '.ai-menu__sliders{display:flex;flex-direction:column;gap:14px}',
                '.ai-menu__slider-row{display:flex;flex-direction:column;gap:6px}',
                '.ai-menu__slider-label{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--ai-text)}',
                '.ai-menu .ai-menu__slider-icon{font-size:17px;color:var(--ai-faint)}',
                '.ai-menu__slider-val{margin-left:auto;min-width:40px;text-align:right;font:600 12px/1 var(--ai-mono);color:var(--ai-accent-ink);font-variant-numeric:tabular-nums}',
                '.ai-menu__slider,.ai-menu__adv-slider{-webkit-appearance:none;appearance:none;width:100%;height:4px;margin:7px 0;border-radius:2px;cursor:pointer;background:linear-gradient(to right,rgba(255,255,255,.15) var(--ai-from,0%),var(--ai-accent) var(--ai-from,0%),var(--ai-accent) var(--ai-to,0%),rgba(255,255,255,.15) var(--ai-to,0%))}',
                '.ai-menu__slider::-webkit-slider-thumb,.ai-menu__adv-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;border:0;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.5),0 0 0 4px rgba(0,164,220,.25);cursor:pointer}',
                '.ai-menu__slider::-moz-range-thumb,.ai-menu__adv-slider::-moz-range-thumb{width:18px;height:18px;border-radius:50%;border:0;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.5),0 0 0 4px rgba(0,164,220,.25);cursor:pointer}',
                '.ai-menu__adv-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:42px;padding:8px 10px 8px 12px;border-radius:10px;border:1px solid var(--ai-line);background:transparent;color:var(--ai-text);font-size:12.5px;font-weight:600;text-align:left;cursor:pointer;transition:border-color .15s,background .15s}',
                '.ai-menu__adv-toggle:hover{border-color:var(--ai-line-2);background:var(--ai-raise)}',
                '.ai-menu__adv-note{margin-left:6px;font-weight:500;color:var(--ai-faint)}',
                '.ai-menu .ai-menu__adv-caret{font-size:20px;color:var(--ai-faint)}',
                '.ai-menu__adv{display:flex;flex-direction:column;gap:8px;max-height:0;overflow:hidden;transition:max-height .28s ease}',
                '.ai-menu__adv--open{max-height:640px;padding-top:10px}',
                '.ai-menu__adv-row{display:flex;flex-direction:column;gap:4px;padding:9px 12px;border-radius:10px;background:var(--ai-raise)}',
                '.ai-menu__adv-label{display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:600;color:var(--ai-dim)}',
                '.ai-menu__adv-val{font:600 12px/1 var(--ai-mono);color:var(--ai-accent-ink);font-variant-numeric:tabular-nums}',

                /* Buttons */
                '.ai-menu__filter-actions{display:flex;gap:8px;margin-top:18px}',
                '.ai-menu__filter-btn{flex:1;min-height:40px;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;transition:background .15s,border-color .15s,color .15s}',
                '.ai-menu__filter-btn:disabled{opacity:.4;cursor:not-allowed}',
                '.ai-menu__filter-btn--secondary{background:transparent;border:1px solid var(--ai-line-2);color:var(--ai-text)}',
                '.ai-menu__filter-btn--secondary:hover:not(:disabled){background:var(--ai-raise)}',
                /* Dark ink on the accent: white on #00a4dc is under 3:1 */
                '.ai-menu__filter-btn--primary{background:var(--ai-accent);border:1px solid var(--ai-accent);color:#03141d}',
                '.ai-menu__filter-btn--primary:hover:not(:disabled){background:#1cb4e8;border-color:#1cb4e8}',

                /* Auto pane */
                '.ai-menu__auto-loading{padding:26px 4px;color:var(--ai-faint);font-size:12.5px;text-align:center}',
                '.ai-menu__auto-master{display:flex;align-items:center;gap:14px;padding:14px;border-radius:12px;background:var(--ai-raise);border:1px solid var(--ai-line)}',
                '.ai-menu__auto-master--on{background:linear-gradient(135deg,rgba(0,164,220,.17),rgba(0,164,220,.05));border-color:rgba(0,164,220,.45)}',
                '.ai-menu__auto-master-text{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}',
                '.ai-menu__auto-master-title{display:flex;align-items:center;gap:8px;font-size:14.5px;font-weight:700}',
                '.ai-menu__auto-state{padding:4px 6px;border-radius:5px;background:rgba(255,255,255,.08);color:var(--ai-dim);font:700 10px/1 var(--ai-mono);letter-spacing:.1em}',
                '.ai-menu__auto-master--on .ai-menu__auto-state{background:rgba(0,164,220,.22);color:var(--ai-accent-ink)}',
                '.ai-menu__auto-master-sub{font-size:12px;line-height:1.5;color:var(--ai-dim)}',
                '.ai-menu__auto-card{margin-top:10px;padding:14px;border-radius:12px;background:var(--ai-raise);border:1px solid var(--ai-line)}',
                '.ai-menu__auto-card--muted{color:var(--ai-dim);font-size:12.5px;line-height:1.55}',
                '.ai-menu__auto-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}',
                '.ai-menu__auto-card-title{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ai-faint)}',
                '.ai-menu__auto-scale{padding:4px 7px;border-radius:6px;background:rgba(0,164,220,.18);color:var(--ai-accent-ink);font:700 12px/1 var(--ai-mono)}',
                '.ai-menu__auto-model{font:600 18px/1.25 var(--ai-mono);letter-spacing:-.01em;word-break:break-all}',
                '.ai-menu__auto-size{margin-top:5px;font:500 12px/1.3 var(--ai-mono);color:var(--ai-dim)}',
                '.ai-menu__auto-reason{margin-top:9px;font-size:12.5px;line-height:1.55;color:var(--ai-dim)}',
                '.ai-menu__auto-warn{margin-top:9px;padding:8px 10px;border-radius:8px;background:rgba(245,185,74,.1);color:var(--ai-warn);font-size:12px;line-height:1.5}',
                '.ai-menu__auto-signals{margin-top:9px}',
                '.ai-menu__auto-signals summary{cursor:pointer;font-size:12px;color:var(--ai-faint)}',
                '.ai-menu__auto-signals ul{margin:6px 0 0;padding-left:18px;font-size:12px;line-height:1.6;color:var(--ai-dim)}',
                '.ai-menu__auto-row{display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid var(--ai-line)}',
                '.ai-menu__auto-row:last-of-type{border-bottom:0}',
                '.ai-menu__auto-row--off{opacity:.45}',
                '.ai-menu__auto-row-text{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}',
                '.ai-menu__auto-row-label{font-size:13px;font-weight:600}',
                '.ai-menu__auto-row-sub{font-size:11.5px;line-height:1.45;color:var(--ai-faint)}',
                '.ai-menu__auto-suggest{display:flex;align-items:center;gap:12px;margin-top:10px;padding:12px 12px 12px 14px;border-radius:12px;background:rgba(61,220,151,.07);border:1px solid rgba(61,220,151,.3)}',
                '.ai-menu__auto-suggest-text{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}',
                '.ai-menu__auto-suggest-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ai-faint)}',
                '.ai-menu__auto-suggest-value{font-size:13.5px;font-weight:600}',
                '.ai-menu__auto-suggest-cur{font-size:12px;font-weight:500;color:var(--ai-faint)}',
                '.ai-menu__auto-suggest .ai-menu__filter-btn{flex:0 0 auto}',
                '.ai-menu__auto-actions{display:flex;gap:8px;margin-top:16px}',

                /* Realtime pane */
                '.ai-menu__rt-card{padding:14px;border-radius:12px;background:var(--ai-raise);border:1px solid var(--ai-line)}',
                '.ai-menu__rt-status{display:flex;align-items:center;gap:10px;min-width:0}',
                '.ai-menu__rt-indicator{width:9px;height:9px;flex-shrink:0;border-radius:50%;background:var(--ai-faint)}',
                '.ai-menu__rt-indicator--on{background:var(--ai-good);box-shadow:0 0 0 4px rgba(61,220,151,.16);animation:aiPulse 2.4s ease-in-out infinite}',
                '.ai-menu__rt-label{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ai-faint)}',
                '.ai-menu__rt-value{margin-left:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 13.5px/1.2 var(--ai-mono);color:var(--ai-dim)}',
                '.ai-menu__rt-value--on{color:var(--ai-good)}',
                '.ai-menu__rt-row{display:flex;gap:8px;margin-top:14px}',
                '.ai-menu__engines{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}',
                '.ai-menu__engine{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:10px;border:1px solid transparent;background:var(--ai-raise);cursor:pointer;transition:background .2s}', '.ai-menu__engine:hover{background:rgba(255,255,255,0.1)}',
                '.ai-menu__engine--on{border-color:rgba(61,220,151,.4);background:rgba(61,220,151,.07)}',
                '.ai-menu__engine-name{font-size:13px;font-weight:600}',
                '.ai-menu__engine--on .ai-menu__engine-name::after{content:"running";margin-left:8px;padding:2px 6px;border-radius:5px;background:rgba(61,220,151,.18);color:var(--ai-good);font:700 9.5px/1 var(--ai-mono);letter-spacing:.08em;text-transform:uppercase;vertical-align:2px}',
                '.ai-menu__engine-desc{font-size:11.5px;line-height:1.45;color:var(--ai-faint)}',

                /* Footer */
                '.ai-menu__footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 10px 10px 16px;flex-shrink:0;border-top:1px solid var(--ai-line)}',
                '.ai-menu__summary{display:flex;align-items:center;gap:8px;min-width:0;font-size:12px;color:var(--ai-dim)}',
                '.ai-menu__summary-dot{width:7px;height:7px;flex-shrink:0;border-radius:50%;background:var(--ai-good)}',
                '.ai-menu__summary-dot--off{background:var(--ai-faint)}',
                '.ai-menu__summary-strong{font-family:var(--ai-mono);font-weight:600;color:var(--ai-text)}',
                '.ai-menu__action{display:inline-flex;align-items:center;gap:2px;min-height:34px;padding:6px 6px 6px 12px;border:0;border-radius:9px;background:transparent;color:var(--ai-accent-ink);font-size:12.5px;font-weight:700;white-space:nowrap;cursor:pointer;transition:background .15s}',
                '.ai-menu__action:hover{background:var(--ai-accent-bg)}',

                /* Phones: a bottom sheet across the full width */
                '@media (max-width:600px){' +
                    '.ai-menu,.ai-menu--left,.ai-menu--right,.ai-menu--center{left:0;right:0;bottom:0;width:auto;max-width:none;max-height:80vh;border-radius:18px 18px 0 0;border-bottom:0;transform:none;animation-name:aiSheetIn;padding-bottom:env(safe-area-inset-bottom,0px)}' +
                    '.ai-menu__grip{display:block;width:38px;height:4px;margin:8px auto 0;border-radius:2px;background:rgba(255,255,255,.25)}' +
                    '.ai-menu__header{padding-top:8px}' +
                    '.ai-menu__tab{gap:4px;font-size:12px}' +
                '}',
                '@keyframes aiSheetIn{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}',
                /* Short windows: less offset from the bottom, more room for content */
                '@media (max-height:620px) and (min-width:601px){.ai-menu{bottom:72px;max-height:calc(100vh - 88px)}}',
                /* TVs and large monitors, usually read from a distance. zoom scales the
                   panel's own lengths too, so its offset and height cap are divided back. */
                '@media (min-width:1800px){.ai-menu{zoom:1.15;bottom:84px;max-height:calc((100vh - 150px) / 1.15)}}',
                '@media (prefers-reduced-motion:reduce){.ai-menu,.ai-menu *,.ai-notif{animation:none!important;transition:none!important}}',

                /* Notifications */
                '.ai-notif-host{position:fixed;top:20px;right:20px;z-index:100001;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;max-height:80vh}',
                '.ai-notif{position:static;display:flex;align-items:center;gap:10px;max-width:360px;padding:10px 14px;border-radius:12px;background:rgba(15,18,23,.94);border:1px solid rgba(255,255,255,.1);box-shadow:0 12px 32px rgba(0,0,0,.45);color:#f1f3f6;font:500 13px/1.4 "Noto Sans",-apple-system,"Segoe UI",system-ui,sans-serif;pointer-events:none;animation:aiNotifIn .22s ease-out}',
                '.ai-notif::before{content:"";width:8px;height:8px;flex-shrink:0;border-radius:50%;background:#00a4dc}',
                '.ai-notif--success::before{background:#3ddc97}',
                '.ai-notif--warning::before{background:#f5b94a}',
                '.ai-notif--error::before{background:#ff6b6b}',
                '@keyframes aiNotifIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}'
            ].join('');

            document.head.appendChild(styles);
            this._stylesInjected = true;
        }
    };

    // Make available globally
    window.PlayerIntegration = PlayerIntegration;
    PlayerIntegration._watchMediaRequests();

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { PlayerIntegration.init(); });
    } else {
        PlayerIntegration.init();
    }
})();











