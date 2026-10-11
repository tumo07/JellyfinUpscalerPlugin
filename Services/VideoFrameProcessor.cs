using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using CliWrap;
using SixLabors.ImageSharp;
using JellyfinUpscalerPlugin.Models;
using Image = SixLabors.ImageSharp.Image;

namespace JellyfinUpscalerPlugin.Services
{
    /// <summary>
    /// Signals that the Docker AI service returned a local resize/original fallback.
    /// Video jobs must not turn this into a successful-looking library result.
    /// </summary>
    public sealed class AiUpscalingUnavailableException(string message) : InvalidOperationException(message)
    {
    }

    /// <summary>
    /// Handles frame-level operations: extraction, AI upscaling, HDR frame processing, and video reconstruction.
    /// </summary>
    public class VideoFrameProcessor
    {
        private readonly ILogger _logger;
        private string _ffmpegPath;

        public void UpdateFFmpegPath(string newPath)
        {
            if (!string.IsNullOrEmpty(newPath))
            {
                _ffmpegPath = newPath;
            }
        }

        // v1.7.3.1 - depends on IUpscalerCore interface (test-seam) instead of concrete.
        private readonly IUpscalerCore _upscalerCore;
        private readonly UpscalerProgressHub _progressHub;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly System.Collections.Concurrent.ConcurrentDictionary<string, bool> _pausedJobs;

        private PluginConfiguration Config => Plugin.Instance?.Configuration ?? new PluginConfiguration();

        public VideoFrameProcessor(
            ILogger logger,
            string ffmpegPath,
            IUpscalerCore upscalerCore,
            UpscalerProgressHub progressHub,
            IHttpClientFactory httpClientFactory,
            System.Collections.Concurrent.ConcurrentDictionary<string, bool> pausedJobs)
        {
            _logger = logger;
            _ffmpegPath = ffmpegPath;
            _upscalerCore = upscalerCore;
            _progressHub = progressHub;
            _httpClientFactory = httpClientFactory;
            _pausedJobs = pausedJobs;
        }

        /// <summary>
        /// Extract frames from video
        /// </summary>
        public async Task ExtractFramesAsync(
            string inputPath,
            string framesDir,
            double frameRate,
            CancellationToken cancellationToken,
            bool isInterlaced = false,
            bool isHDR = false,
            string jobId = "",
            int estimatedTotalFrames = 0)
        {
            var effectiveFps = frameRate > 0 ? frameRate : 30;

            var vfFilters = new List<string>();
            if (isInterlaced)
            {
                vfFilters.Add("bwdif=mode=send_frame:parity=auto:deint=all");
                _logger.LogInformation("Applying bwdif deinterlacing filter during frame extraction for {File}", Path.GetFileName(inputPath));
            }

            // v1.8.2 - denoise-before-upscale prefilter (Netflix lesson): clean compression
            // noise on the source frames BEFORE they hit the SR model — better reconstruction
            // and a smaller re-encode. Runs after deinterlace, before fps/creative filters.
            var denoisePrefilter = new VideoFilterService().BuildDenoisePrefilter(Config);
            if (denoisePrefilter != null)
            {
                vfFilters.Add(denoisePrefilter);
                _logger.LogInformation("Applying denoise prefilter '{Filter}' before upscale for {File}", denoisePrefilter, Path.GetFileName(inputPath));
            }

            // v1.8.3.22 - a comma is the FILTER SEPARATOR in an ffmpeg filtergraph. On any
            // comma-decimal locale (de-DE, fr-FR) 23.976 rendered as "fps=23,976" and ffmpeg
            // died with "No such filter: '976'" - i.e. every frame-by-frame job on those
            // servers. Lines 484/490 of this same file already did this correctly.
            vfFilters.Add($"fps={effectiveFps.ToString(System.Globalization.CultureInfo.InvariantCulture)}");

            // Camera-style video filters (applied during frame extraction)
            var videoFilterChain = new VideoFilterService().BuildFilterChain(Config);
            if (videoFilterChain != null)
            {
                vfFilters.Add(videoFilterChain);
            }

            if (isHDR)
            {
                // The color matrix must drive pixel conversion, not only output tags.
                if (denoisePrefilter != null || videoFilterChain != null)
                    throw new NotSupportedException("HDR denoise and creative filters have not been validated for RGB16. Disable them before processing PQ.");
                vfFilters.Add("scale=in_color_matrix=bt2020:out_range=pc,format=rgb48be");
            }
            var vfArg = string.Join(",", vfFilters);

            if (isHDR)
            {
                _logger.LogInformation("Extracting frames as 16-bit PNG for HDR content: {File}", Path.GetFileName(inputPath));
            }

            // v1.7.11 - extraction reports no progress on its own (one blocking ffmpeg call), so a
            // background poller counts the written frame_*.png every ~2s and feeds the extraction band
            // (Gap 1). File-count is deliberate (robust across ffmpeg builds vs parsing stderr 'frame=').
            // The CTS is linked to cancellationToken; the finally cancels + awaits the poller so it can
            // never outlive the job (no orphan task, no write-after-clear).
            var frameExt = isHDR ? "png" : "jpg";
            using var pollerCts = System.Threading.CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            var reportExtraction = !string.IsNullOrEmpty(jobId) && estimatedTotalFrames > 0;
            var pollerTask = reportExtraction
                ? Task.Run(async () =>
                {
                    try
                    {
                        while (!pollerCts.Token.IsCancellationRequested)
                        {
                            await Task.Delay(TimeSpan.FromSeconds(2), pollerCts.Token);
                            var n = Directory.Exists(framesDir)
                                ? Directory.GetFiles(framesDir, $"frame_*.{frameExt}").Length : 0;
                            await _progressHub.SendExtractionProgress(jobId, n, estimatedTotalFrames);
                        }
                    }
                    catch (OperationCanceledException) { /* normal: extraction finished or job cancelled */ }
                }, pollerCts.Token)
                : Task.CompletedTask;

            try
            {
                var extractThreads = Math.Clamp((Config?.CpuThreads ?? 12) / 2, 2, 4).ToString();
                var result = await Cli.Wrap(_ffmpegPath)
                    .WithArguments(args => {
                        args.Add("-threads").Add(extractThreads);
                        args.Add("-hwaccel").Add("auto");
                        args.Add("-i").Add(inputPath)
                            .Add("-vf").Add(vfArg);
                        if (isHDR)
                        {
                            args.Add("-pix_fmt").Add("rgb48be");
                            args.Add("-c:v").Add("png").Add("-compression_level").Add("1");
                            args.Add(Path.Combine(framesDir, "frame_%06d.png"));
                        }
                        else
                        {
                            args.Add("-c:v").Add("mjpeg").Add("-q:v").Add("2");
                            args.Add(Path.Combine(framesDir, "frame_%06d.jpg"));
                        }
                    })
                    .WithValidation(CommandResultValidation.None)
                    .ExecuteAsync(cancellationToken);

                if (result.ExitCode != 0)
                {
                    _logger.LogWarning("HW-accelerated frame extraction exited with code {Code}, falling back to software extraction", result.ExitCode);
                    result = await Cli.Wrap(_ffmpegPath)
                        .WithArguments(args => {
                            args.Add("-threads").Add(extractThreads);
                            args.Add("-i").Add(inputPath)
                                .Add("-vf").Add(vfArg);
                            if (isHDR)
                            {
                                args.Add("-pix_fmt").Add("rgb48be");
                                args.Add("-c:v").Add("png").Add("-compression_level").Add("1");
                                args.Add(Path.Combine(framesDir, "frame_%06d.png"));
                            }
                            else
                            {
                                args.Add("-c:v").Add("mjpeg").Add("-q:v").Add("2");
                                args.Add(Path.Combine(framesDir, "frame_%06d.jpg"));
                            }
                        })
                        .WithValidation(CommandResultValidation.None)
                        .ExecuteAsync(cancellationToken);

                    if (result.ExitCode != 0)
                    {
                        throw new InvalidOperationException($"Frame extraction failed with exit code {result.ExitCode}");
                    }
                }
            }
            finally
            {
                // Stop the poller and wait for it (no orphan). Deliberately does NOT clear the
                // extraction cache - that happens only on terminal paths so the bar stays monotonic.
                pollerCts.Cancel();
                try { await pollerTask; } catch { /* poller is best-effort */ }
            }
        }

        /// <summary>
        /// Extract a single frame from a video at the given position and return it as PNG bytes.
        /// Uses input seeking (-ss before -i) for fast keyframe-based seeking.
        /// </summary>
        public async Task<byte[]> ExtractSingleFrameAsync(string videoPath, TimeSpan position, CancellationToken cancellationToken = default, string? ffmpegOverride = null)
        {
            var ffmpeg = !string.IsNullOrEmpty(ffmpegOverride) ? ffmpegOverride : _ffmpegPath;
            if (string.IsNullOrEmpty(ffmpeg))
                throw new InvalidOperationException("FFmpeg path is not configured — cannot extract frames");

            using var ms = new MemoryStream();
            var stderr = new StringBuilder();

            var result = await Cli.Wrap(ffmpeg)
                .WithArguments(args =>
                {
                    args.Add("-ss").Add(position.TotalSeconds.ToString("F2", System.Globalization.CultureInfo.InvariantCulture))
                        .Add("-i").Add(videoPath)
                        .Add("-frames:v").Add("1")
                        .Add("-f").Add("image2pipe")
                        .Add("-vcodec").Add("png")
                        .Add("pipe:1");
                })
                .WithStandardOutputPipe(PipeTarget.ToStream(ms))
                .WithStandardErrorPipe(PipeTarget.ToStringBuilder(stderr))
                .WithValidation(CommandResultValidation.None)
                .ExecuteAsync(cancellationToken);

            if (result.ExitCode != 0 || ms.Length == 0)
            {
                var stderrText = stderr.ToString();
                // Log the last 1000 chars of stderr (the error is typically at the end, after the banner)
                var logPart = stderrText.Length > 1000 ? stderrText[^1000..] : stderrText;
                _logger.LogError("FFmpeg frame extraction failed: exit={Code}, stderr(tail)={Stderr}", result.ExitCode, logPart);
                throw new InvalidOperationException($"Single frame extraction failed (exit code {result.ExitCode}, bytes {ms.Length})");
            }

            return ms.ToArray();
        }

        /// <summary>
        /// Extract a single frame and apply an FFmpeg filter chain in one pass.
        /// Returns the filtered frame as PNG bytes. Used for live filter preview in the config UI.
        /// </summary>
        public async Task<byte[]> ExtractSingleFrameWithFiltersAsync(
            string videoPath,
            TimeSpan position,
            string? filterChain,
            CancellationToken cancellationToken = default,
            string? ffmpegOverride = null)
        {
            var ffmpeg = !string.IsNullOrEmpty(ffmpegOverride) ? ffmpegOverride : _ffmpegPath;
            if (string.IsNullOrEmpty(ffmpeg))
                throw new InvalidOperationException("FFmpeg path is not configured — cannot extract frames");

            using var ms = new MemoryStream();
            var stderr = new StringBuilder();

            var result = await Cli.Wrap(ffmpeg)
                .WithArguments(args =>
                {
                    args.Add("-ss").Add(position.TotalSeconds.ToString("F2", System.Globalization.CultureInfo.InvariantCulture))
                        .Add("-i").Add(videoPath)
                        .Add("-frames:v").Add("1");
                    if (!string.IsNullOrWhiteSpace(filterChain))
                        args.Add("-vf").Add(filterChain);
                    args.Add("-f").Add("image2pipe")
                        .Add("-vcodec").Add("png")
                        .Add("pipe:1");
                })
                .WithStandardOutputPipe(PipeTarget.ToStream(ms))
                .WithStandardErrorPipe(PipeTarget.ToStringBuilder(stderr))
                .WithValidation(CommandResultValidation.None)
                .ExecuteAsync(cancellationToken);

            if (result.ExitCode != 0 || ms.Length == 0)
            {
                var stderrText = stderr.ToString();
                var logPart = stderrText.Length > 1000 ? stderrText[^1000..] : stderrText;
                _logger.LogError("FFmpeg filtered frame extraction failed: exit={Code}, filter={Filter}, stderr(tail)={Stderr}",
                    result.ExitCode, filterChain, logPart);
                throw new InvalidOperationException($"Filtered frame extraction failed (exit code {result.ExitCode}, bytes {ms.Length})");
            }

            return ms.ToArray();
        }

        /// <summary>
        /// Process frames with AI upscaling
        /// </summary>
        /// <summary>
        /// v1.8.3 — upscale ONE frame: read -> AI upscale -> write to processedDir.
        /// Library/batch processing must fail closed when the Docker service falls back to a local
        /// resize; silently copying or storing that CPU result makes the host look busy while the
        /// container remains idle (Discussion #80).
        /// </summary>
        public async Task<bool> UpscaleSingleFrameAsync(
            string frameFile,
            string processedDir,
            VideoProcessingOptions options,
            bool isHDR,
            CancellationToken cancellationToken)
        {
            var frameData = await File.ReadAllBytesAsync(frameFile, cancellationToken);
            byte[]? upscaledData;
            if (isHDR)
            {
                upscaledData = await UpscaleHDRFrameAsync(frameData, options.ScaleFactor, cancellationToken);
            }
            else
            {
                var upscale = await _upscalerCore.UpscaleImageDetailedAsync(
                    frameData, options.Model, options.ScaleFactor, cancellationToken, allowLocalFallback: false);
                if (!upscale.UsedAi)
                {
                    throw new AiUpscalingUnavailableException(
                        $"Docker AI service did not produce an upscaled frame: {upscale.FallbackReason ?? "unknown reason"}");
                }
                upscaledData = upscale.Data;
            }

            var outputFile = Path.Combine(processedDir, Path.GetFileName(frameFile));
            if (upscaledData != null && upscaledData.Length > 0)
            {
                if (!isHDR)
                {
                    int srcW, srcH;
                    if (!TryGetPngDimensions(frameData, out srcW, out srcH) && !TryGetJpegDimensions(frameData, out srcW, out srcH))
                    {
                        var source = Image.Identify(frameData);
                        srcW = source.Width;
                        srcH = source.Height;
                    }
                    ValidateNativeAiOutput(upscaledData, srcW, srcH);
                }
                await File.WriteAllBytesAsync(outputFile, upscaledData, cancellationToken);
                return true;
            }

            throw new InvalidDataException("Upscaling returned no frame; original-frame fallback is forbidden.");
        }

        public async Task ProcessFramesAsync(
            string framesDir,
            string processedDir,
            VideoProcessingOptions options,
            string processingJobId,
            CancellationToken cancellationToken,
            bool isHDR = false)
        {
            var pattern = isHDR ? "*.png" : "*.jpg";
            var frameFiles = Directory.GetFiles(framesDir, pattern).OrderBy(f => f).ToArray();
            if (frameFiles.Length == 0 && !isHDR)
            {
                frameFiles = Directory.GetFiles(framesDir, "*.png").OrderBy(f => f).ToArray();
            }
            int totalFrames = frameFiles.Length;
            if (totalFrames == 0)
                throw new InvalidDataException("No frames were extracted for AI processing.");
            cancellationToken.ThrowIfCancellationRequested();

            if (await TryProcessFramesNativeAotAsync(framesDir, processedDir, options, processingJobId, cancellationToken, isHDR))
            {
                return;
            }

            int maxConcurrency = 1;
            try
            {
                var profile = await _upscalerCore.DetectHardwareAsync();
                maxConcurrency = Math.Max(1, profile.MaxConcurrentStreams);
            }
            catch (Exception ex) when (ex is not OperationCanceledException) { _logger.LogDebug(ex, "Hardware detection failed, using default concurrency"); }

            // Model-adaptive concurrency cap:
            // Heavy neural models (ncnn / realesrgan): cap at 2 to saturate Vulkan GPU queue without CPU thrashing
            if (options.Model?.Contains("ncnn", StringComparison.OrdinalIgnoreCase) == true ||
                options.Model?.Contains("realesrgan", StringComparison.OrdinalIgnoreCase) == true)
            {
                maxConcurrency = Math.Clamp(maxConcurrency, 1, 2);
            }

            _logger.LogInformation("Processing {TotalFrames} frames with max concurrency: {MaxConcurrency}", totalFrames, maxConcurrency);

            var processedFrames = 0;
            var startTime = DateTime.UtcNow;
            long lastProgressTicks = DateTime.UtcNow.Ticks;

            // Parallel.ForEachAsync stops scheduling on the first failure, cancels its
            // in-flight workers and joins them before returning. A task list behind a
            // semaphore continued the whole movie after Docker had already failed.
            await Parallel.ForEachAsync(frameFiles, new ParallelOptions
            {
                MaxDegreeOfParallelism = maxConcurrency,
                CancellationToken = cancellationToken
            }, async (frameFile, frameToken) =>
            {
                // Check for pause before processing.
                while (_pausedJobs.GetValueOrDefault(processingJobId, false))
                {
                    await Task.Delay(500, frameToken);
                }

                // Any failed/empty frame aborts the video. Copying the original would
                // create a partly upscaled output and report an incomplete job as success.
                await UpscaleSingleFrameAsync(frameFile, processedDir, options, isHDR, frameToken);
                var completed = Interlocked.Increment(ref processedFrames);
                var nowTicks = DateTime.UtcNow.Ticks;
                var prevTicks = Interlocked.Read(ref lastProgressTicks);
                if ((nowTicks - prevTicks) >= TimeSpan.TicksPerSecond * 2 || completed == totalFrames)
                {
                    if (Interlocked.CompareExchange(ref lastProgressTicks, nowTicks, prevTicks) == prevTicks)
                    {
                        var elapsed = (DateTime.UtcNow - startTime).TotalSeconds;
                        var fps = elapsed > 0 ? completed / elapsed : 0;
                        await _progressHub.SendFrameProgress(processingJobId, Path.GetFileName(frameFile), completed, totalFrames, fps);
                        _logger.LogInformation("Processed {ProcessedFrames}/{TotalFrames} frames ({Fps} FPS)",
                            completed, totalFrames, fps.ToString("F1"));
                    }
                }
            });
        }

        /// <summary>
        /// Check if the requested model can be upscaled natively using the precompiled realesrgan-ncnn-vulkan executable.
        /// </summary>
        public bool CanUseNativeNcnnUpscaler(string? modelName)
        {
            if (string.IsNullOrWhiteSpace(modelName)) return false;
            if (!modelName.Contains("ncnn", StringComparison.OrdinalIgnoreCase) &&
                !modelName.Contains("realesrgan", StringComparison.OrdinalIgnoreCase) &&
                !modelName.Contains("animevideo", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
            return !string.IsNullOrEmpty(GetNativeNcnnExecutablePath());
        }

        public string? GetNativeNcnnExecutablePath()
        {
            var configPath = Config?.NativeNcnnBinaryPath;
            if (!string.IsNullOrWhiteSpace(configPath) && File.Exists(configPath))
                return configPath;

            // Probe 1: Subfolder in Jellyfin data directory (outside plugins folder to avoid BadImageFormatException)
            var dataCandidate = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "data", "ncnn_vulkan", "realesrgan-ncnn-vulkan.exe");
            if (File.Exists(dataCandidate)) return dataCandidate;

            // Probe 2: Plugin data folder
            var pluginDataDir = Plugin.Instance?.DataFolderPath ?? "";
            if (!string.IsNullOrEmpty(pluginDataDir))
            {
                var candidate = Path.Combine(pluginDataDir, "ncnn_vulkan", "realesrgan-ncnn-vulkan.exe");
                if (File.Exists(candidate)) return candidate;
            }

            // Probe 3: Standard AI service scratch location on host
            var scratchCandidate = @"C:\Users\khoa\.gemini\antigravity\scratch\JellyfinUpscalerPlugin\docker-ai-service\ncnn_vulkan\realesrgan-ncnn-vulkan.exe";
            if (File.Exists(scratchCandidate)) return scratchCandidate;

            // Probe 4: Relative path from current working directory
            var relativeScratch = Path.GetFullPath(Path.Combine("docker-ai-service", "ncnn_vulkan", "realesrgan-ncnn-vulkan.exe"));
            if (File.Exists(relativeScratch)) return relativeScratch;

            return null;
        }

        public string? GetNativeNcnnModelsPath(string exePath)
        {
            var exeDir = Path.GetDirectoryName(exePath) ?? "";
            var modelsDir = Path.Combine(exeDir, "models");
            if (Directory.Exists(modelsDir)) return modelsDir;
            return null;
        }

        public (string ModelName, int Scale) MapNativeNcnnModel(string modelName, int scaleFactor)
        {
            var lower = modelName.ToLowerInvariant();
            int scale = scaleFactor > 0 ? scaleFactor : 2;

            if (lower.Contains("anime"))
            {
                if (lower.Contains("x4") || scale == 4)
                {
                    return ("realesr-animevideov3", 4);
                }
                if (lower.Contains("x3") || scale == 3)
                {
                    return ("realesr-animevideov3", 3);
                }
                return ("realesr-animevideov3", 2);
            }

            if (lower.Contains("x4plus") || lower.Contains("x4"))
            {
                return ("realesrgan-x4plus", 4);
            }

            return ("realesr-animevideov3", Math.Clamp(scale, 2, 4));
        }

        public async Task<bool> TryProcessFramesNativeAotAsync(
            string framesDir,
            string processedDir,
            VideoProcessingOptions options,
            string processingJobId,
            CancellationToken cancellationToken,
            bool isHDR = false)
        {
            if (!CanUseNativeNcnnUpscaler(options.Model))
                return false;

            var exePath = GetNativeNcnnExecutablePath();
            if (string.IsNullOrEmpty(exePath) || !File.Exists(exePath))
                return false;

            var modelsDir = GetNativeNcnnModelsPath(exePath);
            if (string.IsNullOrEmpty(modelsDir) || !Directory.Exists(modelsDir))
                return false;

            var (mappedModel, scale) = MapNativeNcnnModel(options.Model ?? "", options.ScaleFactor);
            var pattern = isHDR ? "*.png" : "*.jpg";
            var frameFiles = Directory.GetFiles(framesDir, pattern);
            if (frameFiles.Length == 0 && !isHDR)
            {
                pattern = "*.png";
                frameFiles = Directory.GetFiles(framesDir, pattern);
            }
            int totalFrames = frameFiles.Length;
            if (totalFrames == 0) return false;

            var ext = isHDR ? "png" : "jpg";
            var gpuId = Math.Max(0, Config?.GpuDeviceIndex ?? 0);

            _logger.LogInformation("Executing native AOT machine code Vulkan upscaler: {Exe} (model={Model}, scale={Scale}, frames={Total})",
                Path.GetFileName(exePath), mappedModel, scale, totalFrames);

            using var pollerCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            var startTime = DateTime.UtcNow;

            var pollerTask = Task.Run(async () =>
            {
                try
                {
                    while (!pollerCts.Token.IsCancellationRequested)
                    {
                        await Task.Delay(1000, pollerCts.Token);
                        var completed = Directory.Exists(processedDir)
                            ? Directory.GetFiles(processedDir, $"*.{ext}").Length
                            : 0;
                        var elapsed = (DateTime.UtcNow - startTime).TotalSeconds;
                        var fps = elapsed > 0 ? completed / elapsed : 0;
                        await _progressHub.SendFrameProgress(processingJobId, $"frame_{completed:D6}.{ext}", completed, totalFrames, fps);
                        _logger.LogInformation("Native AOT upscaled {Completed}/{Total} frames ({Fps:F1} FPS)", completed, totalFrames, fps);
                    }
                }
                catch (OperationCanceledException) { }
            }, pollerCts.Token);

            try
            {
                var result = await Cli.Wrap(exePath)
                    .WithArguments(args =>
                    {
                        args.Add("-i").Add(framesDir)
                            .Add("-o").Add(processedDir)
                            .Add("-n").Add(mappedModel)
                            .Add("-s").Add(scale.ToString())
                            .Add("-m").Add(modelsDir)
                            .Add("-f").Add(ext)
                            .Add("-g").Add(gpuId.ToString())
                            .Add("-j").Add("1:2:2");
                    })
                    .WithValidation(CommandResultValidation.None)
                    .ExecuteAsync(cancellationToken);

                pollerCts.Cancel();
                try { await pollerTask; } catch { }

                if (result.ExitCode != 0)
                {
                    _logger.LogWarning("Native AOT upscaler exited with code {Code}. Falling back to standard pipeline.", result.ExitCode);
                    return false;
                }

                var processedFiles = Directory.GetFiles(processedDir, $"*.{ext}");
                if (processedFiles.Length < totalFrames)
                {
                    _logger.LogWarning("Native AOT produced {Count}/{Total} frames. Falling back to standard pipeline.", processedFiles.Length, totalFrames);
                    return false;
                }

                var totalElapsed = Math.Max(0.1, (DateTime.UtcNow - startTime).TotalSeconds);
                var avgFps = totalFrames / totalElapsed;
                _logger.LogInformation("Native AOT successfully upscaled {Total} frames in {Elapsed:F1}s ({Fps:F1} FPS)",
                    totalFrames, totalElapsed, avgFps);
                await _progressHub.SendFrameProgress(processingJobId, $"frame_{totalFrames:D6}.{ext}", totalFrames, totalFrames, avgFps);

                return true;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                pollerCts.Cancel();
                try { await pollerTask; } catch { }
                _logger.LogWarning(ex, "Native AOT execution encountered an error, falling back to HTTP pipeline");
                return false;
            }
        }

        /// <summary>
        /// Upscale a single HDR frame via the /upscale-hdr endpoint on the AI service
        /// </summary>
        public async Task<byte[]?> UpscaleHDRFrameAsync(byte[] frameData, int scale, CancellationToken cancellationToken)
        {
            if (scale < 1 || scale > 8)
            {
                _logger.LogWarning("Invalid scale factor {Scale} for HDR upscaling, using default 2", scale);
                scale = 2;
            }

            var config = Plugin.Instance?.Configuration;
            // v1.8.3.22 - TrimEnd. A configured URL with a trailing slash produced
            // "http://host:5000//upscale-hdr", which FastAPI answers with 404 - and the
            // caller silently copied every original frame through, so the whole HDR job
            // re-encoded unchanged and reported success. HttpUpscalerService.GetServiceUrl
            // has trimmed for releases; this copy never did.
            var baseUrl = (config?.AiServiceUrl ?? "http://localhost:5000").TrimEnd('/');
            HdrFrameContract.ValidateRgb16Png(frameData);
            var client = _httpClientFactory.CreateClient("UpscalerHDR");

            using var content = new MultipartFormDataContent();
            using var imageContent = new ByteArrayContent(frameData);
            imageContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
            content.Add(imageContent, "file", "frame.png");
            content.Add(new StringContent(scale.ToString()), "scale");
            content.Add(new StringContent("smpte2084"), "transfer");
            content.Add(new StringContent("bt2020"), "primaries");

            _logger.LogDebug("Sending HDR frame ({Size} bytes) to AI service for {Scale}x upscaling", frameData.Length, scale);

            using var response = await client.PostAsync($"{baseUrl}/upscale-hdr", content, cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                var output = await response.Content.ReadAsByteArrayAsync(cancellationToken);
                var nativeScale = HdrFrameContract.ValidateOutput(frameData, output);
                _logger.LogDebug("HDR frame native output scale: {Scale}x", nativeScale);
                return output;
            }

            _logger.LogWarning("HDR upscale failed with status {Status}", response.StatusCode);
            throw new InvalidDataException($"HDR service rejected frame ({(int)response.StatusCode}): {await response.Content.ReadAsStringAsync(cancellationToken)}");
        }

        /// <summary>
        /// Reconstruct video from processed frames
        /// </summary>
        public async Task ReconstructVideoAsync(
            string processedDir,
            string originalPath,
            string outputPath,
            VideoProcessingOptions options,
            double frameRate,
            CancellationToken cancellationToken,
            VideoInfo? inputInfo = null)
        {
            var tempAudioPath = Path.Combine(Path.GetTempPath(), $"temp_audio_{Guid.NewGuid()}.mka");
            var hasAudio = false;
            var effectiveFps = frameRate > 0 ? frameRate : 30.0;
            var isHDR = inputInfo?.IsHDR ?? false;
            HdrFrameContract.Validate(inputInfo, ProcessingMethod.FrameByFrame, Config.OutputCodec);
            ValidateFrameSequence(processedDir);

            try
            {
                var audioResult = await Cli.Wrap(_ffmpegPath)
                    .WithArguments(args => args
                        .Add("-i").Add(originalPath)
                        .Add("-vn").Add("-acodec").Add("copy")
                        .Add("-y").Add(tempAudioPath))
                    .WithValidation(CommandResultValidation.None)
                    .ExecuteAsync(cancellationToken);

                hasAudio = audioResult.ExitCode == 0 && File.Exists(tempAudioPath) && new FileInfo(tempAudioPath).Length > 0;

                if (!hasAudio)
                {
                    _logger.LogInformation("No audio track found in source video");
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Failed to extract audio, continuing without audio");
                hasAudio = false;
            }

            // v1.6.1.23 - allowlist sourced from CodecRegistry (was inline 7-entry list missing
            // libsvtav1, libaom-av1, libvpx-vp9, av1_nvenc, av1_qsv).
            var outputCodec = Config.OutputCodec ?? "libx264";
            if (!CodecRegistry.OutputCodecs.Contains(outputCodec))
            {
                _logger.LogWarning("Invalid output codec '{Codec}' in ReconstructVideoAsync, falling back to libx264", outputCodec);
                outputCodec = "libx264";
            }

            string codecArgs;
            if (outputCodec == "copy")
            {
                codecArgs = "-c:v copy";
            }
            else if (isHDR)
            {
                codecArgs = $"-c:v {outputCodec} -pix_fmt yuv420p10le -colorspace bt2020nc -color_primaries bt2020 -color_trc smpte2084";
                _logger.LogInformation("Using HDR output settings: 10-bit yuv420p10le with BT.2020/PQ metadata");
            }
            else
            {
                codecArgs = $"-c:v {outputCodec} -pix_fmt yuv420p";
                if (outputCodec == "libx264" || outputCodec == "libx265")
                {
                    var encThreads = Math.Clamp((Config?.CpuThreads ?? 12) / 2, 2, 4);
                    codecArgs += $" -preset fast -threads {encThreads}";
                }
            }

            var framePattern = File.Exists(Path.Combine(processedDir, "frame_000001.jpg"))
                ? "frame_%06d.jpg"
                : "frame_%06d.png";

            var result = await Cli.Wrap(_ffmpegPath)
                .WithArguments(args => {
                    args.Add("-xerror")
                        .Add("-framerate").Add(effectiveFps.ToString(System.Globalization.CultureInfo.InvariantCulture))
                        .Add("-i").Add(Path.Combine(processedDir, framePattern));
                    if (hasAudio && File.Exists(tempAudioPath))
                        args.Add("-i").Add(tempAudioPath);
                    foreach (var part in codecArgs.Split(' ', StringSplitOptions.RemoveEmptyEntries))
                        args.Add(part);
                    if (isHDR)
                    {
                        args.Add("-vf").Add("scale=out_color_matrix=bt2020:in_range=pc:out_range=tv");
                        args.Add("-color_range").Add("tv");
                        args.Add("-x265-params").Add(HdrFrameContract.X265Parameters(inputInfo!));
                    }
                    args.Add("-r").Add(effectiveFps.ToString(System.Globalization.CultureInfo.InvariantCulture));
                    if (hasAudio && File.Exists(tempAudioPath))
                        args.Add("-c:a").Add("copy");
                    args.Add("-y").Add(outputPath);
                })
                .WithValidation(CommandResultValidation.None)
                .ExecuteAsync(cancellationToken);

            try
            {
                if (File.Exists(tempAudioPath))
                {
                    File.Delete(tempAudioPath);
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to cleanup temp audio file");
            }

            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException($"Video reconstruction failed with exit code {result.ExitCode}");
            }
        }

        /// <summary>
        /// Encode a raw RGB24 frame buffer to JPEG bytes for transport to AI service.
        /// </summary>
        public static byte[] EncodeRawFrameToJpeg(byte[] rawRgb, int width, int height)
        {
            using var image = Image.LoadPixelData<SixLabors.ImageSharp.PixelFormats.Rgb24>(rawRgb, width, height);
            using var ms = new MemoryStream();
            image.SaveAsJpeg(ms, new SixLabors.ImageSharp.Formats.Jpeg.JpegEncoder { Quality = 90 });
            return ms.ToArray();
        }

        /// <summary>
        /// Decode a service response and derive its native scale from real pixels.
        /// Never resize an unexpected image to make it fit the configured scale.
        /// </summary>
        private static int ValidateNativeScale(int width, int height, int frameCount, int sourceWidth, int sourceHeight)
        {
            if (sourceWidth <= 0 || sourceHeight <= 0 || frameCount != 1)
                throw new InvalidDataException("AI output requires a single image and known source dimensions.");
            var scale = width / sourceWidth;
            if (scale < 1 || scale > 8 || width != sourceWidth * scale || height != sourceHeight * scale)
                throw new InvalidDataException("AI output dimensions do not match a supported native model scale.");
            return scale;
        }

        /// <summary>
        /// Fast zero-allocation extraction of width and height from PNG header (first 24 bytes).
        /// Standard PNG layout: 8 bytes magic, 4 bytes length, 4 bytes "IHDR", 4 bytes width, 4 bytes height.
        /// </summary>
        public static bool TryGetPngDimensions(ReadOnlySpan<byte> pngBytes, out int width, out int height)
        {
            width = 0;
            height = 0;
            if (pngBytes.Length < 24) return false;
            if (pngBytes[0] != 0x89 || pngBytes[1] != 0x50 || pngBytes[2] != 0x4E || pngBytes[3] != 0x47 ||
                pngBytes[4] != 0x0D || pngBytes[5] != 0x0A || pngBytes[6] != 0x1A || pngBytes[7] != 0x0A)
            {
                return false;
            }
            if (pngBytes[12] != 0x49 || pngBytes[13] != 0x48 || pngBytes[14] != 0x44 || pngBytes[15] != 0x52)
            {
                return false;
            }
            width = BinaryPrimitives.ReadInt32BigEndian(pngBytes.Slice(16, 4));
            height = BinaryPrimitives.ReadInt32BigEndian(pngBytes.Slice(20, 4));
            return width > 0 && height > 0;
        }

        public static bool TryGetPngDimensionsFromFile(string filePath, out int width, out int height)
        {
            width = 0;
            height = 0;
            try
            {
                using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                Span<byte> header = stackalloc byte[24];
                int read = fs.Read(header);
                if (read < 24) return false;
                return TryGetPngDimensions(header, out width, out height);
            }
            catch
            {
                return false;
            }
        }

        internal static bool TryGetJpegDimensions(ReadOnlySpan<byte> bytes, out int width, out int height)
        {
            width = 0;
            height = 0;
            if (bytes.Length < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8) return false;
            int offset = 2;
            while (offset < bytes.Length - 8)
            {
                if (bytes[offset] != 0xFF) { offset++; continue; }
                byte marker = bytes[offset + 1];
                if (marker == 0xC0 || marker == 0xC1 || marker == 0xC2 || marker == 0xC3)
                {
                    if (offset + 8 < bytes.Length)
                    {
                        height = (bytes[offset + 5] << 8) | bytes[offset + 6];
                        width = (bytes[offset + 7] << 8) | bytes[offset + 8];
                        return width > 0 && height > 0;
                    }
                }
                if (marker == 0xD9 || marker == 0xDA) break;
                if (offset + 3 < bytes.Length)
                {
                    int len = (bytes[offset + 2] << 8) | bytes[offset + 3];
                    offset += 2 + len;
                }
                else break;
            }
            try
            {
                var info = Image.Identify(bytes);
                if (info != null)
                {
                    width = info.Width;
                    height = info.Height;
                    return true;
                }
            }
            catch { }
            return false;
        }

        internal static bool TryGetDimensionsFromFile(string filePath, out int width, out int height)
        {
            if (filePath.EndsWith(".png", StringComparison.OrdinalIgnoreCase) && TryGetPngDimensionsFromFile(filePath, out width, out height))
                return true;
            try
            {
                var info = Image.Identify(filePath);
                if (info != null)
                {
                    width = info.Width;
                    height = info.Height;
                    return true;
                }
            }
            catch { }
            width = 0;
            height = 0;
            return false;
        }

        internal static (int Width, int Height, int Scale) ValidateNativeAiOutput(
            byte[] imageBytes, int sourceWidth, int sourceHeight)
        {
            if (TryGetPngDimensions(imageBytes, out int width, out int height))
            {
                var scale = ValidateNativeScale(width, height, 1, sourceWidth, sourceHeight);
                return (width, height, scale);
            }
            if (TryGetJpegDimensions(imageBytes, out int jw, out int jh))
            {
                var scale = ValidateNativeScale(jw, jh, 1, sourceWidth, sourceHeight);
                return (jw, jh, scale);
            }
            using var image = Image.Load(imageBytes);
            var fallbackScale = ValidateNativeScale(image.Width, image.Height, image.Frames.Count, sourceWidth, sourceHeight);
            return (image.Width, image.Height, fallbackScale);
        }

        internal static void ValidateFrameSequence(string processedDir)
        {
            var frames = Directory.GetFiles(processedDir, "frame_*.jpg").OrderBy(f => f, StringComparer.Ordinal).ToArray();
            var frameExt = "jpg";
            if (frames.Length == 0)
            {
                frames = Directory.GetFiles(processedDir, "frame_*.png").OrderBy(f => f, StringComparer.Ordinal).ToArray();
                frameExt = "png";
            }
            if (frames.Length == 0) throw new InvalidDataException("No processed frames are available for encoding.");
            int firstWidth, firstHeight;
            if (!TryGetDimensionsFromFile(frames[0], out firstWidth, out firstHeight))
            {
                var first = Image.Identify(frames[0]);
                firstWidth = first.Width;
                firstHeight = first.Height;
            }
            for (var index = 0; index < frames.Length; index++)
            {
                if (Path.GetFileName(frames[index]) != $"frame_{index + 1:D6}.{frameExt}")
                    throw new InvalidDataException("Processed frame sequence has a missing or out-of-order frame.");
                if (index == 0 || index == frames.Length - 1 || index % 50 == 0 || frames.Length <= 100)
                {
                    int w, h;
                    if (!TryGetDimensionsFromFile(frames[index], out w, out h))
                    {
                        var info = Image.Identify(frames[index]);
                        w = info.Width;
                        h = info.Height;
                    }
                    if (w != firstWidth || h != firstHeight)
                        throw new InvalidDataException("AI output dimensions changed within the video; mixed model scales are not supported.");
                }
            }
        }

        internal static (byte[] Data, int Width, int Height, int Scale) DecodeNativeAiFrame(
            byte[] imageBytes, int sourceWidth, int sourceHeight)
        {
            using var image = Image.Load<SixLabors.ImageSharp.PixelFormats.Rgb24>(imageBytes);
            var scale = ValidateNativeScale(image.Width, image.Height, image.Frames.Count, sourceWidth, sourceHeight);
            var rawBytes = new byte[checked(image.Width * image.Height * 3)];
            image.CopyPixelDataTo(rawBytes);
            return (rawBytes, image.Width, image.Height, scale);
        }

        /// <summary>
        /// Decode JPEG bytes from AI service back to raw RGB24 frame buffer.
        /// Returns null if decoding fails or dimensions do not match.
        /// </summary>
        public static byte[]? DecodeJpegToRawFrame(byte[] jpegBytes, int expectedWidth, int expectedHeight)
        {
            try
            {
                using var image = Image.Load<SixLabors.ImageSharp.PixelFormats.Rgb24>(jpegBytes);
                if (image.Width != expectedWidth || image.Height != expectedHeight)
                {
                    return null;
                }

                var rawBytes = new byte[expectedWidth * expectedHeight * 3];
                image.CopyPixelDataTo(rawBytes);
                return rawBytes;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"DecodeJpegToRawFrame failed: {ex.Message}");
                return null;
            }
        }
    }
}
