using System;
using System.IO;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using JellyfinUpscalerPlugin.Services;
using JellyfinUpscalerPlugin.Models;
using System.Collections.Concurrent;

namespace JellyfinUpscalerPlugin.Tests
{
    public class NativeNcnnAotUpscalerTests
    {
        private VideoFrameProcessor CreateProcessor()
        {
            return new VideoFrameProcessor(
                NullLogger.Instance,
                "ffmpeg",
                null!,
                null!,
                null!,
                new ConcurrentDictionary<string, bool>());
        }

        [Theory]
        [InlineData(null, false)]
        [InlineData("", false)]
        [InlineData("   ", false)]
        [InlineData("fsrcnn-x2", false)]
        [InlineData("espcn-x4", false)]
        [InlineData("edsr-x2", false)]
        public void CanUseNativeNcnnUpscaler_ReturnsFalse_ForNonNcnnModels(string? model, bool expected)
        {
            var processor = CreateProcessor();
            Assert.Equal(expected, processor.CanUseNativeNcnnUpscaler(model));
        }

        [Fact]
        public void CanUseNativeNcnnUpscaler_ReturnsTrue_ForNcnnAnimeModel_WhenBinaryExists()
        {
            var processor = CreateProcessor();
            var exe = processor.GetNativeNcnnExecutablePath();
            if (!string.IsNullOrEmpty(exe) && File.Exists(exe))
            {
                Assert.True(processor.CanUseNativeNcnnUpscaler("ncnn-realesrgan-anime-x2"));
            }
        }

        [Theory]
        [InlineData("ncnn-realesrgan-anime-x2", 2, "realesr-animevideov3", 2)]
        [InlineData("ncnn-realesrgan-anime-x4", 4, "realesr-animevideov3", 4)]
        [InlineData("realesrgan-x4plus", 4, "realesrgan-x4plus", 4)]
        [InlineData("realesr-animevideov3", 2, "realesr-animevideov3", 2)]
        [InlineData("realesr-animevideov3", 3, "realesr-animevideov3", 3)]
        public void MapNativeNcnnModel_MapsCorrectly(string model, int scaleIn, string expectedName, int expectedScale)
        {
            var processor = CreateProcessor();
            var (name, scale) = processor.MapNativeNcnnModel(model, scaleIn);
            Assert.Equal(expectedName, name);
            Assert.Equal(expectedScale, scale);
        }

        [Fact]
        public void GetNativeNcnnModelsPath_ResolvesModelsDirectory()
        {
            var processor = CreateProcessor();
            var exe = processor.GetNativeNcnnExecutablePath();
            if (!string.IsNullOrEmpty(exe))
            {
                var modelsDir = processor.GetNativeNcnnModelsPath(exe);
                Assert.NotNull(modelsDir);
                Assert.True(Directory.Exists(modelsDir));
                Assert.True(File.Exists(Path.Combine(modelsDir, "realesr-animevideov3-x2.bin")));
            }
        }
    }
}
