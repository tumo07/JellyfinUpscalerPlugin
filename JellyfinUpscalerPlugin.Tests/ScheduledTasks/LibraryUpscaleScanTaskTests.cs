using FluentAssertions;
using JellyfinUpscalerPlugin.ScheduledTasks;
using Xunit;

namespace JellyfinUpscalerPlugin.Tests.ScheduledTasks
{
    public class LibraryUpscaleScanTaskTests
    {
        [Theory]
        [InlineData(1920, 1080, false)] // 1080p standard Full HD
        [InlineData(1920, 800, false)]  // 1080p widescreen cinema format
        [InlineData(1920, 816, false)]  // 1080p widescreen format
        [InlineData(2560, 1440, false)] // 1440p QHD
        [InlineData(3840, 2160, false)] // 4K UHD
        [InlineData(1280, 720, false)]  // 720p standard HD
        [InlineData(1280, 534, false)]  // 720p widescreen HD
        [InlineData(960, 720, false)]   // 720p 4:3 format
        [InlineData(720, 480, true)]    // 480p DVD NTSC
        [InlineData(640, 480, true)]    // 480p 4:3 SD
        [InlineData(854, 480, true)]    // 480p 16:9 SD
        [InlineData(720, 576, true)]    // 576p DVD PAL
        [InlineData(1024, 576, true)]   // 576p PAL widescreen
        [InlineData(960, 540, true)]    // 540p qHD
        [InlineData(640, 360, true)]    // 360p SD
        [InlineData(320, 240, true)]    // 240p low-res
        [InlineData(0, 0, false)]       // Invalid dimensions
        [InlineData(-1, 480, false)]    // Negative dimensions
        public void IsLowResolutionVideo_StandardResolutions_ClassifiedCorrectly(int width, int height, bool expectedLowRes)
        {
            var isLowRes = LibraryUpscaleScanTask.IsLowResolutionVideo(width, height);
            isLowRes.Should().Be(expectedLowRes);
        }

        [Fact]
        public void IsLowResolutionVideo_CustomLowerThreshold_RespectsConfiguredBounds()
        {
            // If configured with 720x480 max, 480p should be skipped and only <480p should be accepted
            LibraryUpscaleScanTask.IsLowResolutionVideo(640, 480, 720, 480).Should().BeFalse();
            LibraryUpscaleScanTask.IsLowResolutionVideo(320, 240, 720, 480).Should().BeTrue();
        }

        [Theory]
        [InlineData("Copy of Family Guy - S04E06 - Petarded", true)]
        [InlineData("Bản sao của SS12E15", true)]
        [InlineData("Bản sao SS12E15", true)]
        [InlineData("Copie de Movie", true)]
        [InlineData("Kopie von Episode", true)]
        [InlineData("Copia de Video", true)]
        [InlineData("Movie - Copy", true)]
        [InlineData("Movie - Bản sao", true)]
        [InlineData("Movie (1)", true)]
        [InlineData("Movie (2)", true)]
        [InlineData("Family Guy - S04E06 - Petarded (1)", true)]
        [InlineData("Family Guy - S04E06 - Petarded", false)]
        [InlineData("SS12E15", false)]
        [InlineData("Movie_2024", false)]
        [InlineData(null, false)]
        [InlineData("", false)]
        public void IsDuplicateOrCopy_CorrectlyIdentifiesDuplicates(string? fileName, bool expectedDuplicate)
        {
            var isDup = LibraryUpscaleScanTask.IsDuplicateOrCopy(fileName);
            isDup.Should().Be(expectedDuplicate);
        }

        [Fact]
        public void CleanupStaleTempDirectories_DeletesOnlyStaleDirectories()
        {
            var baseTemp = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "JellyfinUpscaler");
            System.IO.Directory.CreateDirectory(baseTemp);

            var staleDir = System.IO.Path.Combine(baseTemp, $"test_stale_{System.Guid.NewGuid():N}");
            var freshDir = System.IO.Path.Combine(baseTemp, $"test_fresh_{System.Guid.NewGuid():N}");

            System.IO.Directory.CreateDirectory(staleDir);
            System.IO.Directory.CreateDirectory(freshDir);

            try
            {
                // Set stale directory LastWriteTime to 30 minutes ago
                System.IO.Directory.SetLastWriteTimeUtc(staleDir, System.DateTime.UtcNow.AddMinutes(-30));
                // Set fresh directory LastWriteTime to now
                System.IO.Directory.SetLastWriteTimeUtc(freshDir, System.DateTime.UtcNow);

                JellyfinUpscalerPlugin.Services.ProcessingMethodExecutor.CleanupStaleTempDirectories();

                System.IO.Directory.Exists(staleDir).Should().BeFalse("Stale temp directory should have been cleaned up");
                System.IO.Directory.Exists(freshDir).Should().BeTrue("Fresh temp directory should remain untouched");
            }
            finally
            {
                try { if (System.IO.Directory.Exists(staleDir)) System.IO.Directory.Delete(staleDir, true); } catch { }
                try { if (System.IO.Directory.Exists(freshDir)) System.IO.Directory.Delete(freshDir, true); } catch { }
            }
        }
    }
}
