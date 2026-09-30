import {
  VideoUpscaler,
  ImageUpscaler,
  Anime4KShader,
  Anime4K_Clamp_Highlights,
  Anime4K_Restore_CNN_S,
  Anime4K_Restore_CNN_M,
  Anime4K_Restore_CNN_L,
  Anime4K_Restore_CNN_VL,
  Anime4K_Restore_CNN_UL,
  Anime4K_Restore_CNN_Soft_S,
  Anime4K_Restore_CNN_Soft_M,
  Anime4K_Restore_CNN_Soft_VL,
  Anime4K_Upscale_CNN_x2_S,
  Anime4K_Upscale_CNN_x2_M,
  Anime4K_Upscale_CNN_x2_L,
  Anime4K_Upscale_CNN_x2_VL,
  Anime4K_Upscale_CNN_x2_UL,
  Anime4K_Upscale_Denoise_CNN_x2_S,
  Anime4K_Upscale_Denoise_CNN_x2_M,
  Anime4K_Upscale_Denoise_CNN_x2_VL,
  Anime4K_AutoDownscalePre_x2,
  Anime4K_AutoDownscalePre_x4,
  Anime4K_Darken_Fast,
  Anime4K_Darken_HQ,
  Anime4K_Thin_Fast,
  Anime4K_Thin_HQ,
  Anime4K_Denoise_Bilateral_Mode,
  Anime4K_Denoise_Bilateral_Median,
  Anime4K_Deblur_DoG,
  ANIME4KJS_SIMPLE_S_2X,
  ANIME4KJS_SIMPLE_M_2X,
  ANIME4KJS_SIMPLE_L_2X,
  ANIME4KJS_SIMPLE_VL_2X,
  ANIME4KJS_SIMPLE_UL_2X,
  ANIME4K_HIGHEREND_MODE_A,
  ANIME4K_HIGHEREND_MODE_B,
  ANIME4K_HIGHEREND_MODE_C,
  ANIME4K_HIGHEREND_MODE_A_FAST,
  ANIME4K_LOWEREND_MODE_A,
  ANIME4K_LOWEREND_MODE_A_FAST,
  ANIME4K_LOWEREND_MODE_B,
  ANIME4K_LOWEREND_MODE_C,
} from "anime4k.js";

// 1. Ultra Deblock + Cel Cleanup for heavy low-bitrate SD archives (Bilateral Median + Mode + Cel Line Restore)
export const ANIME4KJS_ARCHIVE_HEAVY_DEBLOCK_2X = [
  Anime4K_Clamp_Highlights,
  Anime4K_Denoise_Bilateral_Median,
  Anime4K_Denoise_Bilateral_Mode,
  Anime4K_Darken_Fast,
  Anime4K_Thin_Fast,
  Anime4K_Upscale_Denoise_CNN_x2_M,
  Anime4K_Restore_CNN_M
];

// 2. Pure Cel Denoise (Bilateral Median & Mode filter: flattens macroblocks while preserving contours)
export const ANIME4KJS_CEL_CLEAN_2X = [
  Anime4K_Clamp_Highlights,
  Anime4K_Denoise_Bilateral_Median,
  Anime4K_Denoise_Bilateral_Mode,
  Anime4K_Upscale_CNN_x2_M,
  Anime4K_Restore_CNN_M
];

// 3. Ultra-fast Denoise + Restore pipeline tuned for older compressed archives on Intel UHD 730
export const ANIME4KJS_SIMPLE_DENOISE_M_2X = [
  Anime4K_Clamp_Highlights,
  Anime4K_Upscale_Denoise_CNN_x2_M,
  Anime4K_Restore_CNN_M
];

// 4. Mode C+A: Heavy Artifact Cleanup + Line Thinning & Acuity (best for bad 480p DVD/TV rips)
export const ANIME4KJS_MODE_CA_2X = [
  Anime4K_Clamp_Highlights,
  Anime4K_Upscale_Denoise_CNN_x2_M,
  Anime4K_Thin_Fast,
  Anime4K_Restore_CNN_M
];

// 5. Cartoon Pop: Darkens outlines and thins bleeding contours for high-contrast animated cartoons
export const ANIME4KJS_CARTOON_POP_2X = [
  Anime4K_Clamp_Highlights,
  Anime4K_Darken_Fast,
  Anime4K_Thin_Fast,
  Anime4K_Upscale_CNN_x2_M,
  Anime4K_Restore_CNN_M
];

// 6. Bilateral Denoise: Smooths macroblocks in flat areas while preserving sharp edges
export const ANIME4KJS_BILATERAL_DENOISE_2X = [
  Anime4K_Clamp_Highlights,
  Anime4K_Denoise_Bilateral_Mode,
  Anime4K_Upscale_CNN_x2_M,
  Anime4K_Restore_CNN_M
];

export {
  VideoUpscaler,
  ImageUpscaler,
  Anime4KShader,
  ANIME4KJS_SIMPLE_S_2X,
  ANIME4KJS_SIMPLE_M_2X,
  ANIME4KJS_SIMPLE_L_2X,
  ANIME4KJS_SIMPLE_VL_2X,
  ANIME4KJS_SIMPLE_UL_2X,
  ANIME4K_HIGHEREND_MODE_A,
  ANIME4K_HIGHEREND_MODE_B,
  ANIME4K_HIGHEREND_MODE_C,
  ANIME4K_HIGHEREND_MODE_A_FAST,
  ANIME4K_LOWEREND_MODE_A,
  ANIME4K_LOWEREND_MODE_A_FAST,
  ANIME4K_LOWEREND_MODE_B,
  ANIME4K_LOWEREND_MODE_C,
};
